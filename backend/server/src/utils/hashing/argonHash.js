import argon2 from "argon2";
import crypto from "node:crypto";
<<<<<<< HEAD
import APIError from "../utils/APIError.js";
=======
import APIError from "../APIError.js";
>>>>>>> 20dadd5 (reorder files and move to utils folder)
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  try {
    const hash = await argon2.hash(password, {
      salt: Buffer.from(salt, "hex"),
      type: argon2.argon2id, // Use Argon2id
      memoryCost: 4096, // Corresponds to 4096 * 1024 bytes = 4MB (increase for higher security)
      timeCost: 3, // Iterations
      parallelism: 1, // Threads
    });
    return { hash, salt };
  } catch (_error) {
    throw new APIError(
      "An error occurred while generating new hash password",
      500
    );
  }
};

// Function to compare the provided password with the stored hash and salt
export const comparePassword = async (password, storedHash, storedSalt) => {
  try {
    // Verifying the provided password against the stored hash and salt using argon2
    return await argon2.verify(storedHash, password, {
      salt: Buffer.from(storedSalt, "hex"), // Converting the stored salt from hexadecimal to Buffer
      type: argon2.argon2d, // Using the argon2d hashing algorithm for verification
    });
  } catch (_err) {
    // If there's an error (e.g., verification failure), return false
    return false;
  }
};
