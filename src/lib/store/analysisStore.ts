import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { AnalyzeResult, SolveAnalysis } from "@/lib/analysis/analyze";

interface AnalysisState {
  /** The solve this analysis is tied to, if it was opened from the solve list — lets "Save to this solve" know what to save onto. */
  solveId: string | null;
  scramble: string;
  reconstruction: string;
  /** Solve time in ms, or null when not supplied — it only unlocks turn-speed findings. */
  timeMs: number | null;
  /**
   * Per-move elapsed ms from solve start, parallel to `reconstruction`'s
   * moves — only present for a solve captured live off a smart cube, where
   * every move really happened at that exact moment. Lets the 3D replay play
   * back at the cuber's actual pace instead of a uniform tempo.
   */
  moveTimestamps: number[] | null;
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
  requestAnalysis: (
    scramble: string,
    timeMs: number | null,
    solveId?: string,
    savedReconstruction?: string,
    moveTimestamps?: number[],
  ) => void;
  run: () => Promise<void>;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  solveId: null,
  scramble: "",
  reconstruction: "",
  timeMs: null,
  moveTimestamps: null,
  result: null,
  errors: [],
  loading: false,
  requestSeq: 0,

  setScramble: (scramble) => set({ scramble }),
  // Hand-editing the reconstruction invalidates any real per-move timing it
  // came with — the timestamps would no longer line up with the new moves.
  setReconstruction: (reconstruction) => set({ reconstruction, moveTimestamps: null }),
  setTimeMs: (timeMs) => set({ timeMs }),

  requestAnalysis: (scramble, timeMs, solveId, savedReconstruction, moveTimestamps) =>
    set((s) => ({
      scramble,
      timeMs,
      solveId: solveId ?? null,
      // Prefills a reconstruction already saved on this solve, so reopening
      // one you've analyzed before doesn't mean retyping it — but a fresh
      // request always starts from a blank box, never a leftover from
      // whichever solve was analyzed previously.
      reconstruction: savedReconstruction ?? "",
      moveTimestamps: moveTimestamps ?? null,
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

  clear: () => set({ reconstruction: "", result: null, errors: [], timeMs: null, solveId: null, moveTimestamps: null }),
}));
