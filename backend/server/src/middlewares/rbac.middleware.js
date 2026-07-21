import APIError, { ERROR_CODES } from "../utils/APIError.js";

/**
 * Role-based access control guard.
 *
 * Use AFTER passport authentication so `req.user` is populated. Pass the roles
 * allowed to access the route; anyone else gets a 403.
 *
 * The four roles come from spec §2:
 *   super_admin | billing | noc | auditor
 *
 * @example
 *   router.post(
 *     "/plans",
 *     passport.authenticate("jwt", { session: false }),
 *     requireRole("super_admin", "billing"),
 *     catchAsync(handler)
 *   );
 *
 * @param {...string} allowedRoles - Roles permitted to access the route.
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (...allowedRoles) => {
  return (req, _res, next) => {
    // Fail safe: if there's no authenticated user, this route was misconfigured
    // (RBAC placed before authentication). Treat as forbidden rather than crash.
    if (!req.user) {
      return next(new APIError("Authentication required", 401, ERROR_CODES.TOKEN_INVALID));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new APIError(
          "You do not have permission to perform this action",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    return next();
  };
};

export default requireRole;
