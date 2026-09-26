import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ExperimentKind = "cube" | "setup" | "algorithm" | "method" | "routine" | "other";

export interface Experiment {
  id: string;
  name: string;
  kind: ExperimentKind;
  note: string;
  /** When the change happened (ms epoch): solves before are "before", after are "after". */
  at: number;
}

interface ExperimentState {
  experiments: Experiment[];
  add: (e: Experiment) => void;
  remove: (id: string) => void;
}

/** Logged changes to test against your solves — see lib/analysis/experiment. */
export const useExperimentStore = create<ExperimentState>()(
  persist(
    (set) => ({
      experiments: [],
      add: (e) => set((s) => ({ experiments: [e, ...s.experiments] })),
      remove: (id) => set((s) => ({ experiments: s.experiments.filter((e) => e.id !== id) })),
    }),
    { name: "cube-timer-experiments" },
  ),
);
