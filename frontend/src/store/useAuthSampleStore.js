import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const useAuthStore = create()(
  persist(
    (set, _get, api) => ({
      token: null,
      isAuthenticated: false,
      userData: null,
      roles: [],
      permissions: [],
      // profile: null,
      // previousPath: '/',
      setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setUserData: (userData) => set({ userData }),
      setRoles: (roles) => set({ roles }),
      setPermissions: (permissions) => set({ permissions }),
      // setProfile: profile => set({ profile }),
      // setPreviousPath: path => set({ previousPath: path }),
      logout: () => {
        set({
          token: null,
          isAuthenticated: false,
          userData: null,
          roles: [],
          // profile: null,
          // previousPath: '/',
        });
        api.persist.clearStorage();
        // queryClient.invalidateQueries();
        // queryClient.clear();
        window.location.reload();
      },
    }),
    {
      name: "auth-user",
      storage: createJSONStorage(() => sessionStorage),
      //   partialize: (state) => ({
      //     token: state.token,
      //     userData: state.userData,
      //     // isAuthenticated: state.isAuthenticated,
      //   }),
    },
  ),
);
