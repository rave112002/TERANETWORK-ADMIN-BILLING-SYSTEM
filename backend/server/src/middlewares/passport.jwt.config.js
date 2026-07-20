import fs from "fs";
import passport from "passport";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import path from "path";

// Function to configure Passport with JWT strategy
const configurePassport = (db) => {
  // Reading the public key from the file system for verifying JWT signature
  const publicKey = fs.readFileSync(
    path.resolve(`${process.env.jwtAuthPublicPath}`),
    "utf-8"
  );

  // Setting up options for the JWT strategy
  const opts = {};
  opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken(); // Extract JWT from the Bearer token in the Authorization header
  opts.secretOrKey = publicKey; // Using the public key to verify the JWT
  opts.issuer = process.env.ISSUER; // Setting the expected issuer of the JWT
  opts.audience = process.env.AUDIENCE; // Setting the expected audience of the JWT
  opts.algorithms = ['RS256']; // Only accept RS256 algorithm tokens

  // Using the JWT strategy with Passport
  passport.use(
    "jwt",
    new JwtStrategy(opts, async (jwt_payload, done) => {
      const { userId, exp } = jwt_payload; //destructuring data
      const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

      // Check if the token is expired manually (optional; passport-jwt does this too)
      if (exp && exp < currentTime) {
        return done(null, false, { message: "Token has expired" });
      }

      try {
        const [user] = await db.query(``, [userId] );

        // If user is not found in the database, return an error
        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        // Check if the user's account is deactivated or deleted
        if (user.isActive !== 0) {
          return done(null, false, {
            message:
              user.isActive === 1
                ? `Your account has been deactivated. Contact admin for reactivation of account.`
                : `Your account has been deleted.`,
          });
        }

        // If user exists and is active, pass the user data to the next middleware
          return done(null, user);
      } catch (error) {
        // passing error to the done callback
        done(error, null);
      }
    })
  );
};

// Exporting the function to be used in other parts of the app

export default configurePassport;
