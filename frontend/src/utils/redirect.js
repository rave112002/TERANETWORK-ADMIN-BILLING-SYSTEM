import { ADMIN_MODULES, SUPER_ADMIN_MODULES } from "./menu";

export const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  USER: "USER",
};

export const ROLE_MODULES = {
  SUPERADMIN: SUPER_ADMIN_MODULES,
  ADMIN: ADMIN_MODULES,
};

export const DEFAULT_REDIRECT = "/login";

export const getModulesByRole = (role) => ROLE_MODULES[role] ?? [];

// Get the first module link for a given role
export const getRedirectByRole = (role) => {
  if (!role) return null;
  
  const modules = getModulesByRole(role);
  const firstItem = modules.find((m) => m.type === "item" && m.link);
  
  return firstItem?.link ?? null;
};
