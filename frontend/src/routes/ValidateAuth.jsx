import { Navigate, Outlet } from "react-router-dom";

export const Auth = ({ store, redirect, allowedRoles = [] }) => {
  const token = store((state) => state.token);
  const roles = store((state) => state.roles);

  if (!token) {
    return <Navigate to={redirect} replace />;
  }

  // Check if user has one of the allowed roles
  if (allowedRoles.length > 0 && !allowedRoles.includes(roles)) {
    // Redirect to their appropriate dashboard based on their role
    const roleRedirects = {
      SUPERADMIN: "/superadmin/dashboard",
      ADMIN: "/admin/dashboard",
    };
    return <Navigate to={roleRedirects[roles] || "/login"} replace />;
  }

  return <Outlet />;
};

export const UnAuth = ({ store, redirect }) => {
  const token = store((state) => state.token);
  const roles = store((state) => state.roles);

  if (token) {
    const redirectPath =
      typeof redirect === "function" ? redirect({ roles }) : redirect;
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
};
