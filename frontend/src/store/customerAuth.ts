import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PortalCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  username?: string | null;
}

interface CustomerAuthState {
  token: string | null;
  customer: PortalCustomer | null;
  setAuth: (token: string, customer: PortalCustomer) => void;
  logout: () => void;
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set) => ({
      token: null,
      customer: null,
      setAuth: (token, customer) => set({ token, customer }),
      logout: () => set({ token: null, customer: null }),
    }),
    { name: "alphatech-portal-auth" }
  )
);
