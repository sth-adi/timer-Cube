import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DuelCard } from "@/lib/duel/duel";

interface DuelState {
  name: string;
  /** Friends' cards you've kept, newest version per name. */
  rivals: DuelCard[];
  setName: (name: string) => void;
  keep: (card: DuelCard) => void;
  drop: (name: string) => void;
}

/** DNA Duel: the name on your card and the rivals you've saved. */
export const useDuelStore = create<DuelState>()(
  persist(
    (set) => ({
      name: "",
      rivals: [],
      setName: (name) => set({ name }),
      keep: (card) => set((s) => ({ rivals: [...s.rivals.filter((r) => r.name !== card.name), card].slice(-30) })),
      drop: (name) => set((s) => ({ rivals: s.rivals.filter((r) => r.name !== name) })),
    }),
    { name: "cube-timer-duel" },
  ),
);
