import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DrillRecord {
  drillId: string;
  date: number;
  turns: number;
  ms: number;
  repeated: boolean;
}

interface MistakeDrillState {
  history: DrillRecord[];
  record: (r: DrillRecord) => void;
}

/** Every Mistake Drill retry (last 500), so a drill shows whether you've fixed it. */
export const useMistakeDrillStore = create<MistakeDrillState>()(
  persist(
    (set) => ({
      history: [],
      record: (r) => set((s) => ({ history: [...s.history, r].slice(-500) })),
    }),
    { name: "cube-timer-mistake-drills" },
  ),
);
