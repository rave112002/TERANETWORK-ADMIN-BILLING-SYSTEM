import argon2 from "argon2";
import APIError from "../APIError.js";

/**
 * Hash a plaintext password with argon2id.
 *
 * argon2 generates a random salt automatically and embeds it inside the returned
 * hash string (the standard PHC format, e.g. `$argon2id$v=19$m=65536,...`), so
 * there is no separate salt to store — the single `password_hash` column holds
 * everything needed to verify later.
 *
 * These cost parameters match the ones used by the database seeder so every hash
 * in the system is produced identically.
 *
 * @param {string} password - The plaintext password to hash.
 * @returns {Promise<string>} The argon2id hash string.
 * @throws {APIError} If hashing fails.
 */
export const hashPassword = async (password) => {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3, // iterations
      parallelism: 4, // lanes
    });
  } catch (_error) {
    throw new APIError("Failed to hash password", 500);
  }
};

/**
 * Verify a plaintext password against a stored argon2 hash.
 *
 * The salt and cost parameters are read back out of the stored hash string, so we
 * only need the password and the stored hash — nothing else.
 *
 * @param {string} password - The plaintext password to check.
 * @param {string} storedHash - The argon2 hash previously produced by hashPassword.
 * @returns {Promise<boolean>} True if the password matches, false otherwise.
 */
export const comparePassword = async (password, storedHash) => {
  try {
    return await argon2.verify(storedHash, password);
  } catch (_err) {
    // A malformed hash or verification error is treated as "no match" rather
    // than throwing, so a bad stored value can never accidentally grant access.
    return false;
  }
};
