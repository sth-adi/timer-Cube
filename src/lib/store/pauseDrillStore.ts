import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PauseDrillRecord {
  date: number;
  /** Which hand-off: 1 = cross → 1st pair … 4 = 3rd → last pair. */
  order: number;
  findMs: number;
  totalMs: number;
  turns: number;
  fewestTurns: number;
  /** The pause at this spot in the solve the position came from. */
  originalFindMs: number;
  multislot: boolean;
}

interface PauseDrillState {
  history: PauseDrillRecord[];
  record: (r: PauseDrillRecord) => void;
}

/** Hand-off drills from the F2L Pause Map, kept so real solves before and after drilling can be compared. */
export const usePauseDrillStore = create<PauseDrillState>()(
  persist(
    (set) => ({
      history: [],
      record: (r) => set((s) => ({ history: [...s.history, r].slice(-500) })),
    }),
    { name: "cube-timer-pause-drills" },
  ),
);

/** When you first drilled each hand-off, if ever. */
export function firstDrilled(history: readonly PauseDrillRecord[], order: number): number | null {
  const at = history.filter((h) => h.order === order).map((h) => h.date);
  return at.length ? Math.min(...at) : null;
}
