import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempt, type GymCaseStats } from "@/lib/gym/algGym";

export interface GymRep {
  key: string;
  ok: boolean;
  /** ms epoch. */
  at: number;
}

interface GymState {
  stats: Record<string, GymCaseStats>;
  /** Recent reps with when they happened (capped), for anything that asks "how much this week". */
  log: GymRep[];
  record: (key: string, ok: boolean, execMs: number, recogMs: number) => void;
  reset: () => void;
}

/** Alg Gym's per-case history, kept across sessions so the drill keeps targeting what you're weakest at. */
export const useGymStore = create<GymState>()(
  persist(
    (set) => ({
      stats: {},
      log: [],
      record: (key, ok, execMs, recogMs) =>
        set((s) => ({
          stats: { ...s.stats, [key]: recordAttempt(s.stats[key], ok, execMs, recogMs) },
          log: [...s.log, { key, ok, at: Date.now() }].slice(-1000),
        })),
      reset: () => set({ stats: {}, log: [] }),
    }),
    { name: "cube-timer-alg-gym" },
  ),
);
