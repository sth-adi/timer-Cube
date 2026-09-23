import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AlgIdentity } from "@/lib/smartcube/algId";

export interface SavedAlg {
  notation: string;
  kind: AlgIdentity["kind"];
  caseName: string | null;
  isBookAlg: boolean;
  htm: number;
  /** Fastest recorded execution (ms), or null if never timed. */
  bestMs: number | null;
  timesRecorded: number;
  savedAt: number;
}

interface AlgIdState {
  saved: SavedAlg[];
  /** Saves an identified alg, or — when the same notation is already saved — counts another run and keeps the best time. */
  save: (id: AlgIdentity) => void;
  remove: (notation: string) => void;
}

/** "My algs": sequences identified with the Alg Identifier that you chose to keep, with your best execution of each. */
export const useAlgIdStore = create<AlgIdState>()(
  persist(
    (set) => ({
      saved: [],
      save: (id) =>
        set((s) => {
          const time = id.durationMs > 0 ? id.durationMs : null;
          const existing = s.saved.find((a) => a.notation === id.notation);
          if (existing) {
            return {
              saved: s.saved.map((a) =>
                a.notation === id.notation
                  ? { ...a, timesRecorded: a.timesRecorded + 1, bestMs: time === null ? a.bestMs : Math.min(a.bestMs ?? Infinity, time) }
                  : a,
              ),
            };
          }
          return {
            saved: [
              { notation: id.notation, kind: id.kind, caseName: id.caseName, isBookAlg: id.isBookAlg, htm: id.htm, bestMs: time, timesRecorded: 1, savedAt: Date.now() },
              ...s.saved,
            ],
          };
        }),
      remove: (notation) => set((s) => ({ saved: s.saved.filter((a) => a.notation !== notation) })),
    }),
    { name: "cube-timer-alg-id" },
  ),
);
