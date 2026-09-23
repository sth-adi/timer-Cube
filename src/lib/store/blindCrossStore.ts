import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BlindAttempt, BlindLevel } from "@/lib/blindcross/grade";

interface BlindCrossState {
  level: BlindLevel;
  attempts: BlindAttempt[];
  setLevel: (level: BlindLevel) => void;
  record: (attempt: BlindAttempt) => void;
  reset: () => void;
}

/** Blind Cross history (last 300 attempts) and the chosen level, kept across sessions. */
export const useBlindCrossStore = create<BlindCrossState>()(
  persist(
    (set) => ({
      level: "cross",
      attempts: [],
      setLevel: (level) => set({ level }),
      record: (attempt) => set((s) => ({ attempts: [...s.attempts, attempt].slice(-300) })),
      reset: () => set({ attempts: [] }),
    }),
    { name: "cube-timer-blind-cross" },
  ),
);
