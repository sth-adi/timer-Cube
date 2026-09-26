import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MyAlgsState {
  /** "OLL:Sune" → the algorithm you use for it (yellow top, green front). */
  chosen: Record<string, string>;
  choose: (key: string, alg: string) => void;
  clear: (key: string) => void;
}

export const useMyAlgsStore = create<MyAlgsState>()(
  persist(
    (set) => ({
      chosen: {},
      choose: (key, alg) => set((s) => ({ chosen: { ...s.chosen, [key]: alg } })),
      clear: (key) =>
        set((s) => {
          const next = { ...s.chosen };
          delete next[key];
          return { chosen: next };
        }),
    }),
    { name: "cube-timer-my-algs" },
  ),
);
