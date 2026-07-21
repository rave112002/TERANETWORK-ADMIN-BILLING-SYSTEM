import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "@store/useAuthStore";
import { redirectTo } from "@utils/redirectTo";

/**
 * Guard for protected routes. Requires a token; optionally restricts by role.
 * Remembers the attempted path so login can bounce the user back.
 */
export const Auth = ({ allowedRoles = [] }) => {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const location = useLocation();

  if (!token) {
    redirectTo.set(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Authenticated but not permitted — send to the dashboard.
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

/**
 * Guard for the login page. If already authenticated, skip to the dashboard.
 */
export const UnAuth = () => {
  const token = useAuthStore((s) => s.token);
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};
