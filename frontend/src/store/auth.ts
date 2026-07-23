import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "ADMIN" | "STAFF" | "COMPANY" | "RESELLER" | "SUPER_ADMIN";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "alphatech-auth" }
  )
);
