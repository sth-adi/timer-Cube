import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface XCrossRecord {
  date: number;
  maxDepth: number;
  hit: boolean;
  turns: number | null;
  best: number | null;
}

interface XCrossState {
  maxDepth: number;
  history: XCrossRecord[];
  setMaxDepth: (d: number) => void;
  record: (r: XCrossRecord) => void;
}

/** X-Cross Hunter's difficulty and last 300 attempts, kept across sessions. */
export const useXCrossStore = create<XCrossState>()(
  persist(
    (set) => ({
      maxDepth: 8,
      history: [],
      setMaxDepth: (maxDepth) => set({ maxDepth }),
      record: (r) => set((s) => ({ history: [...s.history, r].slice(-300) })),
    }),
    { name: "cube-timer-xcross-hunter" },
  ),
);
