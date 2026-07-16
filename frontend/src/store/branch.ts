import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BranchState {
  branchId: string | null;
  setBranchId: (id: string) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branchId: null,
      setBranchId: (id) => set({ branchId: id }),
    }),
    { name: "alphatech-branch" }
  )
);
