import { Router } from "express";
import passport from "passport";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { catchAsync, validateBody } from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";
import { comparePassword } from "../../../utils/hashing/argonHash.js";
import { authLimiter } from "../../../middlewares/rateLimiter.js";

const router = Router();

// Load the RSA private key once at startup. This is what SIGNS access tokens.
// Reading it here (not per-request) avoids hitting the disk on every login.
const privateKey = fs.readFileSync(path.resolve(process.env.jwtAuthPrivatePath), "utf-8");

// How long a refresh token stays valid. The access token is short-lived (see
// EXPIRY env); the refresh token is the long-lived credential used to renew it.
const REFRESH_TOKEN_TTL_DAYS = 7;

/**
 * Validation schema for the login request body.
 * Zod rejects anything that isn't a valid email + non-empty password before the
 * handler runs, so the handler can trust its inputs.
 */
const loginSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Sign a short-lived JWT access token for a user.
 * The payload carries `userId` (what the passport JWT strategy looks for) and
 * `role` (handy for authorization checks). RS256 = signed with our private key,
 * verified later with the public key.
 *
 * @param {{ id: number, role: string }} user
 * @returns {string} A signed JWT.
 */
const signAccessToken = (user) => {
  return jwt.sign({ userId: user.id, role: user.role }, privateKey, {
    algorithm: "RS256",
    expiresIn: process.env.EXPIRY || "15m",
    issuer: process.env.ISSUER,
    audience: process.env.AUDIENCE,
  });
};

/**
 * Create a refresh token for a user and store ONLY its SHA-256 hash.
 * The raw token is returned to the caller (and sent to the client); the database
 * never sees the raw value, so a DB leak can't hand out working tokens.
 *
 * @param {import('../../../../config/database.js').default} db
 * @param {number} userId
 * @returns {Promise<string>} The raw refresh token to return to the client.
 */
const issueRefreshToken = async (db, userId) => {
  // 32 random bytes -> 64-char hex string. Unguessable.
  const rawToken = crypto.randomBytes(32).toString("hex");
  // The fingerprint we actually store.
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await db.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [
    userId,
    tokenHash,
    expiresAt,
  ]);

  return rawToken;
};

/**
 * POST /login
 * Authenticate a staff member and issue an access + refresh token pair.
 */
router.post(
  "/login",
  authLimiter, // throttle brute-force attempts (10 / 15 min per IP)
  validateBody(loginSchema),
  catchAsync(async (req, res) => {
    const { email, password } = req.body;

    // Look up the user by email. LIMIT 1 since email is unique.
    const [user] = await req.db.query(
      "SELECT id, name, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Same generic error whether the email is unknown or the password is wrong,
    // so we never reveal which emails exist.
    const invalidCredentials = new APIError(
      "Invalid email or password",
      401,
      ERROR_CODES.INVALID_CREDENTIALS
    );

    if (!user) {
      throw invalidCredentials;
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      throw invalidCredentials;
    }

    // A correct password on a disabled account still must not get in.
    if (user.status !== "active") {
      throw new APIError(
        "This account has been disabled. Contact an administrator.",
        403,
        ERROR_CODES.FORBIDDEN
      );
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(req.db, user.id);

    return res.sendSuccess("Login successful", {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  })
);

/**
 * GET /me
 * Return the currently authenticated user. Protected: passport verifies the
 * Bearer token and populates req.user before this handler runs. No valid token
 * means passport rejects the request with 401 and this code never executes.
 */
router.get(
  "/me",
  passport.authenticate("jwt", { session: false }),
  catchAsync(async (req, res) => {
    const { id, name, email, role, status } = req.user;
    return res.sendSuccess("Current user", { id, name, email, role, status });
  })
);

export default router;
