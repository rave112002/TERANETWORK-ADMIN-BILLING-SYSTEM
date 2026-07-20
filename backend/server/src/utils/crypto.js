import crypto from "node:crypto";

const privateKey = process.env.cryptoKey;

const encrypt = (id) => {
  const key = crypto.createHash("sha256").update(privateKey).digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(id), "utf8", "hex");
  encrypted += cipher.final("hex");

  return encrypted + ":" + iv.toString("hex");
};

/**
 * Encrypt data and return URL-safe base64 string
 * @param {string|number} id - Data to encrypt
 * @returns {string} URL-safe encrypted string
 */
const encryptUrlSafe = (id) => {
  const key = crypto.createHash("sha256").update(privateKey).digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(id), "utf8", "hex");
  encrypted += cipher.final("hex");

  // Combine encrypted data and IV, then convert to URL-safe base64
  const combined = encrypted + ":" + iv.toString("hex");
  return Buffer.from(combined)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

const decrypt = (hex) => {
  try {
    const parts = hex.split(":");
    const encryptedData = parts[0];
    const iv = Buffer.from(parts[1], "hex");

    const key = crypto.createHash("sha256").update(privateKey).digest();

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (_err) {
    throw {
      error: 403,
      message: `Decryption Error`,
    };
  }
};

/**
 * Decrypt URL-safe base64 encrypted string
 * @param {string} urlSafeString - URL-safe encrypted string to decrypt
 * @returns {string|number} Decrypted data
 */
const decryptUrlSafe = (urlSafeString) => {
  try {
    // Convert URL-safe base64 back to standard base64
    let base64 = urlSafeString.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    while (base64.length % 4) {
      base64 += "=";
    }

    // Decode from base64 to get the original encrypted:iv format
    const combined = Buffer.from(base64, "base64").toString("utf8");
    const parts = combined.split(":");
    const encryptedData = parts[0];
    const iv = Buffer.from(parts[1], "hex");

    const key = crypto.createHash("sha256").update(privateKey).digest();

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (_err) {
    throw {
      error: 403,
      message: "Decryption Error",
    };
  }
};

export default {
  encrypt,
  decrypt,
  encryptUrlSafe,
  decryptUrlSafe,
};
