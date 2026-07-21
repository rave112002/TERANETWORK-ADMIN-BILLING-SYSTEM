import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth store — holds the access token and the logged-in staff user.
 *
 * Persisted to sessionStorage so a page refresh keeps you logged in for the tab,
 * but closing the tab clears it. The axios client reads `token` on every request
 * and calls `setToken` / `logout` from its refresh flow.
 */
export const useAuthStore = create()(
  persist(
    (set, _get, api) => ({
      token: null,
      user: null, // { id, name, email, role }
      isAuthenticated: false,

      /** Set both token and user after a successful login. */
      setAuth: ({ token, user }) =>
        set({ token, user, isAuthenticated: !!token }),

      /** Replace just the access token (used by the refresh flow). */
      setToken: (token) => set({ token, isAuthenticated: !!token }),

      /** Clear everything and (optionally) hard-reload to reset app state. */
      logout: ({ reload = false } = {}) => {
        set({ token: null, user: null, isAuthenticated: false });
        api.persist.clearStorage();
        if (reload && typeof window !== "undefined") {
          window.location.assign("/login");
        }
      },
    }),
    {
      name: "auth-user",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
