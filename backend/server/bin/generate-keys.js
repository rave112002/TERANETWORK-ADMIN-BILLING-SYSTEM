#!/usr/bin/env node
/**
 * RSA key pair generator for JWT (RS256) signing and verification.
 *
 * Emits three files into the key directory (default: ./auth-keys):
 *   - public.pem                 SPKI public key       -> verifies tokens (jwtAuthPublicPath)
 *   - private.pem                PKCS#8, passphrase-encrypted (at-rest copy, back this up)
 *   - decrypted_private_key.pem  PKCS#8, plaintext     -> signs tokens (jwtAuthPrivatePath)
 *
 * Usage:
 *   npm run key:generate
 *   npm run key:generate -- --force            overwrite existing keys
 *   npm run key:generate -- --dir ./auth-keys  target directory
 *   npm run key:generate -- --bits 4096        modulus size (default 2048)
 *
 * The passphrase is read from KEY_PASSPHRASE; if unset a random one is generated
 * and printed once — store it in your secrets manager, it is never written to disk.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Optional: this script must run before `npm install` during bootstrap.
try {
  await import("dotenv/config");
} catch {
  // dotenv not installed yet — fall back to real environment variables.
}

const argv = process.argv.slice(2);

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const force = argv.includes("--force");
const bits = parseInt(flag("bits", "2048"), 10);
const keyDir = path.resolve(
  flag("dir", process.env.jwtAuthPath || "./auth-keys")
);

if (!Number.isInteger(bits) || bits < 2048) {
  console.error("❌ --bits must be an integer >= 2048");
  process.exit(1);
}

const files = {
  publicKey: path.join(keyDir, "public.pem"),
  privateKey: path.join(keyDir, "private.pem"),
  decryptedPrivateKey: path.join(keyDir, "decrypted_private_key.pem"),
};

const existing = Object.values(files).filter((f) => fs.existsSync(f));
if (existing.length > 0 && !force) {
  console.error("❌ Keys already exist. Refusing to overwrite:");
  existing.forEach((f) => console.error(`   ${f}`));
  console.error("\n   Re-run with --force if you intend to rotate them.");
  console.error("   Rotating invalidates every JWT signed with the old key.");
  process.exit(1);
}

const passphraseFromEnv = Boolean(process.env.KEY_PASSPHRASE);
const passphrase =
  process.env.KEY_PASSPHRASE || crypto.randomBytes(32).toString("hex");

fs.mkdirSync(keyDir, { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: bits,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase,
  },
});

// Decrypted counterpart the app loads at runtime to sign tokens.
const decryptedPrivateKey = crypto
  .createPrivateKey({ key: privateKey, passphrase })
  .export({ type: "pkcs8", format: "pem" });

// 0o600 — owner read/write only. Ignored on Windows, enforced on Linux/macOS.
fs.writeFileSync(files.publicKey, publicKey, { mode: 0o644 });
fs.writeFileSync(files.privateKey, privateKey, { mode: 0o600 });
fs.writeFileSync(files.decryptedPrivateKey, decryptedPrivateKey, {
  mode: 0o600,
});

console.log(`\n✓ RSA-${bits} key pair generated in ${keyDir}\n`);
console.log(`   public.pem                 ${files.publicKey}`);
console.log(`   private.pem (encrypted)    ${files.privateKey}`);
console.log(`   decrypted_private_key.pem  ${files.decryptedPrivateKey}\n`);

if (!passphraseFromEnv) {
  console.log("   Generated passphrase for private.pem (shown once):");
  console.log(`   KEY_PASSPHRASE=${passphrase}\n`);
}

const rel = (p) => `./${path.relative(process.cwd(), p).replaceAll("\\", "/")}`;

console.log("   Add to .env:");
console.log(`   jwtAuthPath=${rel(keyDir)}`);
console.log(`   jwtAuthPublicPath=${rel(files.publicKey)}`);
console.log(`   jwtAuthPrivatePath=${rel(files.decryptedPrivateKey)}\n`);
console.log("   auth-keys/ is git-ignored. Never commit these files.\n");
