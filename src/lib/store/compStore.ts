import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Attempt, RoundFormat } from "@/lib/comp/round";

export interface CompRound {
  id: string;
  date: number;
  format: RoundFormat;
  attempts: Attempt[];
  /** Null = DNF average; undefined = no average (cutoff missed). */
  average: number | null | undefined;
  best: number | null;
  practiceAvgMs: number | null;
}

interface CompState {
  rounds: CompRound[];
  addRound: (r: CompRound) => void;
  removeRound: (id: string) => void;
}

/** Comp Sim history — every simulated round, so "comp PB" and the comp tax trend have something to read. */
export const useCompStore = create<CompState>()(
  persist(
    (set) => ({
      rounds: [],
      addRound: (r) => set((s) => ({ rounds: [r, ...s.rounds].slice(0, 200) })),
      removeRound: (id) => set((s) => ({ rounds: s.rounds.filter((r) => r.id !== id) })),
    }),
    { name: "cube-timer-comp-sim" },
  ),
);
