import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { CrossDrillResult } from "@/lib/analysis/crossDrill";
import type { Face } from "@/lib/analysis/frames";

export interface DrillAttempt {
  scramble: string;
  result: CrossDrillResult;
}

interface CrossDrillState {
  scramble: string;
  attempt: string;
  /** Which face of the cuber's own grip the cross goes on — white-on-bottom for nearly everyone. */
  crossFace: Face;
  loading: boolean;
  grading: boolean;
  errors: string[];
  /** The graded attempt currently on screen, or null while a fresh scramble waits. */
  last: DrillAttempt | null;
  /** Every attempt this session, newest last, for the running scoreboard. */
  history: DrillAttempt[];
  setAttempt: (v: string) => void;
  setCrossFace: (v: Face) => void;
  newScramble: () => Promise<void>;
  submit: () => Promise<void>;
  reset: () => void;
}

export const useCrossDrillStore = create<CrossDrillState>((set, get) => ({
  scramble: "",
  attempt: "",
  crossFace: "D",
  loading: false,
  grading: false,
  errors: [],
  last: null,
  history: [],

  setAttempt: (attempt) => set({ attempt }),
  setCrossFace: (crossFace) => set({ crossFace }),

  newScramble: async () => {
    set({ loading: true, errors: [], last: null, attempt: "" });
    try {
      const client = getCubeEngineClient();
      await client.ready();
      const scramble = await client.generateScramble();
      set({ scramble, loading: false });
    } catch (err) {
      set({ loading: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  },

  submit: async () => {
    const { scramble, attempt, crossFace, history } = get();
    if (!scramble) return;
    set({ grading: true, errors: [] });
    try {
      const client = getCubeEngineClient();
      await client.ready();
      const outcome = await client.gradeCross({ scramble, attempt, crossFace });
      if (!outcome.ok) {
        set({ grading: false, errors: outcome.errors });
        return;
      }
      const graded: DrillAttempt = { scramble, result: outcome };
      set({ grading: false, last: graded, history: [...history, graded] });
    } catch (err) {
      set({ grading: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  },

  reset: () => set({ history: [], last: null, attempt: "", errors: [] }),
}));
