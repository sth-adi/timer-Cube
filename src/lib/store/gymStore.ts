import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempt, type GymCaseStats } from "@/lib/gym/algGym";

interface GymState {
  stats: Record<string, GymCaseStats>;
  record: (key: string, ok: boolean, execMs: number, recogMs: number) => void;
  reset: () => void;
}

/** Alg Gym's per-case history, kept across sessions so the drill keeps targeting what you're weakest at. */
export const useGymStore = create<GymState>()(
  persist(
    (set) => ({
      stats: {},
      record: (key, ok, execMs, recogMs) => set((s) => ({ stats: { ...s.stats, [key]: recordAttempt(s.stats[key], ok, execMs, recogMs) } })),
      reset: () => set({ stats: {} }),
    }),
    { name: "cube-timer-alg-gym" },
  ),
);
