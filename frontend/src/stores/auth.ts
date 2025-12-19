import { create } from "zustand";

interface AuthStore {
  authRequired: boolean;
  setAuthRequired: (required: boolean) => void;
  logout: (() => void) | null;
  setLogoutHandler: (handler: () => void) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  authRequired: false,
  setAuthRequired: (required) => set({ authRequired: required }),
  logout: null,
  setLogoutHandler: (handler) => set({ logout: handler }),
}));
