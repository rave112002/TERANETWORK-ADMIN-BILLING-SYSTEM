import fs from "fs";
import passport from "passport";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import path from "path";

/**
 * Configure the Passport JWT strategy.
 *
 * When a request carries an `Authorization: Bearer <token>` header, this strategy:
 *   1. Verifies the token signature with our RSA PUBLIC key (RS256 only).
 *   2. Confirms the issuer/audience match what we sign with.
 *   3. Loads the matching user row and attaches it as `req.user`.
 *
 * If any step fails, the request is rejected before it reaches a protected route.
 *
 * @param {import('../../config/database.js').default} db - shared Database instance
 */
const configurePassport = (db) => {
  // The PUBLIC key verifies signatures. It can never mint tokens, so it is safe
  // to keep loaded in memory across all requests.
  const publicKey = fs.readFileSync(path.resolve(`${process.env.jwtAuthPublicPath}`), "utf-8");

  const opts = {
    // Pull the token from the "Authorization: Bearer ..." header.
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: publicKey,
    issuer: process.env.ISSUER,
    audience: process.env.AUDIENCE,
    // Only accept RS256. This rejects "alg: none" and HMAC-confusion attacks.
    algorithms: ["RS256"],
  };

  passport.use(
    "jwt",
    new JwtStrategy(opts, async (jwtPayload, done) => {
      try {
        // We signed the token with { userId, role } (see auth.controller.js).
        const { userId } = jwtPayload;

        const [user] = await db.query(
          "SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1",
          [userId]
        );

        // The user may have been deleted since the token was issued.
        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        // A token is worthless if the account has since been disabled.
        if (user.status !== "active") {
          return done(null, false, { message: "Account is disabled" });
        }

        // Success: this object becomes `req.user` on the protected route.
        return done(null, user);
      } catch (error) {
        // A real error (e.g. DB down) — pass it to Passport's error handling.
        return done(error, false);
      }
    })
  );
};

export default configurePassport;
