import { create } from "zustand";
import { persist } from "zustand/middleware";

// Only meaningful for SUPER_ADMIN: which organization it is currently acting as.
// Sent as the X-Organization-Id header on every API request (see lib/api.ts). Regular
// staff never touch this — their org scope always comes from their own JWT.
interface OrgContextState {
  organizationId: string | null;
  organizationName: string | null;
  setOrganization: (id: string | null, name: string | null) => void;
}

export const useOrgContextStore = create<OrgContextState>()(
  persist(
    (set) => ({
      organizationId: null,
      organizationName: null,
      setOrganization: (id, name) => set({ organizationId: id, organizationName: name }),
    }),
    { name: "alphatech-org-context" }
  )
);
