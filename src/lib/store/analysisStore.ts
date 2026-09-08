import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { AnalyzeResult, SolveAnalysis } from "@/lib/analysis/analyze";

interface AnalysisState {
  scramble: string;
  reconstruction: string;
  /** Solve time in ms, or null when not supplied — it only unlocks turn-speed findings. */
  timeMs: number | null;
  result: SolveAnalysis | null;
  errors: string[];
  loading: boolean;
  /**
   * Bumped whenever something outside the analyzer asks for a solve to be
   * analyzed, so the shell can switch to the analyzer tab without the two
   * components having to know about each other.
   */
  requestSeq: number;
  setScramble: (v: string) => void;
  setReconstruction: (v: string) => void;
  setTimeMs: (v: number | null) => void;
  requestAnalysis: (scramble: string, timeMs: number | null) => void;
  run: () => Promise<void>;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  scramble: "",
  reconstruction: "",
  timeMs: null,
  result: null,
  errors: [],
  loading: false,
  requestSeq: 0,

  setScramble: (scramble) => set({ scramble }),
  setReconstruction: (reconstruction) => set({ reconstruction }),
  setTimeMs: (timeMs) => set({ timeMs }),

  requestAnalysis: (scramble, timeMs) =>
    set((s) => ({
      scramble,
      timeMs,
      reconstruction: "",
      result: null,
      errors: [],
      requestSeq: s.requestSeq + 1,
    })),

  run: async () => {
    const { scramble, reconstruction, timeMs } = get();
    set({ loading: true, errors: [], result: null });
    try {
      const client = getCubeEngineClient();
      await client.ready();
      const result: AnalyzeResult = await client.analyzeSolve({
        scramble,
        reconstruction,
        timeMs: timeMs ?? undefined,
      });
      if (result.ok) set({ result, loading: false });
      else set({ errors: result.errors, loading: false });
    } catch (err) {
      set({ loading: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  },

  clear: () => set({ reconstruction: "", result: null, errors: [], timeMs: null }),
}));
