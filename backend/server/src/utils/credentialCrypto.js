import crypto from "node:crypto";
import APIError from "./APIError.js";

/**
 * Envelope encryption for device credentials (e.g. OLT passwords).
 *
 * HOW IT WORKS (a lock inside a lock):
 *   1. Generate a fresh random 256-bit DATA KEY for this one secret.
 *   2. Encrypt the plaintext with that data key (AES-256-GCM).
 *   3. Encrypt ("wrap") the data key with the MASTER KEY from the environment.
 *   4. Store BOTH the encrypted data and the wrapped data key together.
 *
 * The master key never lives in the database. To decrypt, we first unwrap the
 * data key with the master key, then decrypt the data with the data key.
 *
 * AES-256-GCM is authenticated: any tampering with the stored bytes makes
 * decryption throw instead of returning corrupted data.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is the recommended size for GCM
const ENVELOPE_VERSION = 1; // lets us evolve the format / rotate keys later

/**
 * Load and validate the master key from the environment.
 * Read lazily (per call) so a missing key surfaces where it's used, not at import.
 *
 * @returns {Buffer} 32-byte master key.
 */
const getMasterKey = () => {
  const hex = process.env.CREDENTIAL_MASTER_KEY;
  if (!hex) {
    throw new APIError("CREDENTIAL_MASTER_KEY is not set", 500);
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new APIError("CREDENTIAL_MASTER_KEY must be 32 bytes (64 hex characters)", 500);
  }
  return key;
};

/**
 * Encrypt `plaintext` with `key` using AES-256-GCM.
 * @param {Buffer} key
 * @param {Buffer} plaintext
 * @returns {{ iv: Buffer, tag: Buffer, ciphertext: Buffer }}
 */
const aesEncrypt = (key, plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16-byte integrity/authentication tag
  return { iv, tag, ciphertext };
};

/**
 * Decrypt AES-256-GCM. Throws if the tag doesn't verify (tampered/wrong key).
 * @param {Buffer} key
 * @param {Buffer} iv
 * @param {Buffer} tag
 * @param {Buffer} ciphertext
 * @returns {Buffer}
 */
const aesDecrypt = (key, iv, tag, ciphertext) => {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/**
 * Encrypt a credentials object into a sealed envelope.
 *
 * @param {Object} credentials - e.g. { username, password, enablePassword }.
 * @returns {Buffer} The envelope, ready to store in a VARBINARY column.
 * @throws {APIError} If the master key is missing/invalid.
 *
 * @example
 *   const enc = encryptCredentials({ username: "root", password: "s3cr3t" });
 *   // store `enc` in olts.credentials_enc
 */
export const encryptCredentials = (credentials) => {
  const masterKey = getMasterKey();
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");

  // 1) fresh per-secret data key, 2) encrypt data with it
  const dataKey = crypto.randomBytes(32);
  const data = aesEncrypt(dataKey, plaintext);

  // 3) wrap (encrypt) the data key with the master key
  const wrap = aesEncrypt(masterKey, dataKey);

  // 4) pack everything into one JSON envelope (base64 fields), stored as bytes.
  const envelope = {
    v: ENVELOPE_VERSION,
    wrappedKey: wrap.ciphertext.toString("base64"),
    wrapIv: wrap.iv.toString("base64"),
    wrapTag: wrap.tag.toString("base64"),
    ciphertext: data.ciphertext.toString("base64"),
    iv: data.iv.toString("base64"),
    tag: data.tag.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope), "utf8");
};

/**
 * Decrypt an envelope produced by encryptCredentials back into the object.
 *
 * @param {Buffer|string} envelope - The stored envelope bytes (or string).
 * @returns {Object} The original credentials object.
 * @throws {APIError} If the master key is missing, or the data was tampered with.
 */
export const decryptCredentials = (envelope) => {
  const masterKey = getMasterKey();

  let parsed;
  try {
    const text = Buffer.isBuffer(envelope) ? envelope.toString("utf8") : String(envelope);
    parsed = JSON.parse(text);
  } catch {
    throw new APIError("Malformed credential envelope", 500);
  }

  try {
    // Unwrap the data key with the master key...
    const dataKey = aesDecrypt(
      masterKey,
      Buffer.from(parsed.wrapIv, "base64"),
      Buffer.from(parsed.wrapTag, "base64"),
      Buffer.from(parsed.wrappedKey, "base64")
    );

    // ...then decrypt the actual data with the data key.
    const plaintext = aesDecrypt(
      dataKey,
      Buffer.from(parsed.iv, "base64"),
      Buffer.from(parsed.tag, "base64"),
      Buffer.from(parsed.ciphertext, "base64")
    );

    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    // A failed GCM tag verification lands here — treat as tampering/bad key.
    throw new APIError("Failed to decrypt credentials (tampered or wrong key)", 500);
  }
};

export default { encryptCredentials, decryptCredentials };
