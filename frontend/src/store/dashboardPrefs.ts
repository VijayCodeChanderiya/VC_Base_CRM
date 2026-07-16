import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DASHBOARD_CARDS = [
  { id: "revenue", label: "Revenue this month" },
  { id: "salesCount", label: "Sales this month" },
  { id: "customers", label: "Total customers" },
  { id: "products", label: "Active products" },
  { id: "lowStock", label: "Low stock alerts" },
  { id: "imeiStock", label: "IMEI in stock / sold" },
  { id: "pendingReturns", label: "Pending returns" },
  { id: "warrantyClaims", label: "Active warranty claims" },
  { id: "pendingRma", label: "Open RMA cases" },
  { id: "activeSims", label: "Active SIMs" },
  { id: "vehicles", label: "Vehicles tracked" },
  { id: "salesTrend", label: "Sales trend (14 days)" },
  { id: "topProducts", label: "Top products" },
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]["id"];

type Visibility = Record<DashboardCardId, boolean>;

const DEFAULT_VISIBILITY: Visibility = DASHBOARD_CARDS.reduce((acc, c) => {
  acc[c.id] = true;
  return acc;
}, {} as Visibility);

interface DashboardPrefsState {
  visibility: Visibility;
  toggleCard: (id: DashboardCardId) => void;
  resetAll: () => void;
}

export const useDashboardPrefs = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      visibility: DEFAULT_VISIBILITY,
      toggleCard: (id) =>
        set((state) => ({ visibility: { ...state.visibility, [id]: !state.visibility[id] } })),
      resetAll: () => set({ visibility: DEFAULT_VISIBILITY }),
    }),
    { name: "alphatech-dashboard-prefs" }
  )
);
