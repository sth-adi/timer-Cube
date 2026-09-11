import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { TrainerMode } from "@/lib/solvers/trainerState";

const MAX_TIMES_PER_MODE = 500;

interface TrainerState {
  mode: TrainerMode;
  setupAlg: string;
  loading: boolean;
  error: string | null;
  times: Record<TrainerMode, number[]>;
  setMode: (mode: TrainerMode) => Promise<void>;
  loadNext: () => Promise<void>;
  recordTime: (ms: number) => void;
  resetStats: (mode: TrainerMode) => void;
}

// The engine worker is single-threaded: a slow in-flight PLL generation (its
// from-scratch search can need several retries) keeps running to completion
// even after the user switches modes, since synchronous solver work in the
// worker can't be cancelled mid-computation. Tag each request so a response
// that arrives after a newer one was already issued gets discarded instead
// of clobbering the mode the user is actually looking at.
let requestSeq = 0;

export const useTrainerStore = create<TrainerState>()(
  persist(
    (set, get) => ({
      // "oll" first: it's the fast path (no from-scratch OLL search needed),
      // so opening the Trainer tab never starts with the slow PLL retry loop.
      mode: "oll",
      setupAlg: "",
      loading: false,
      error: null,
      times: { oll: [], pll: [], zbll: [] },

      setMode: async (mode) => {
        if (mode === get().mode && get().setupAlg) return;
        set({ mode, setupAlg: "" });
        await get().loadNext();
      },

      loadNext: async () => {
        const requestId = ++requestSeq;
        const requestedMode = get().mode;
        set({ loading: true, error: null });
        try {
          const setupAlg = await getCubeEngineClient().generateTrainerState(requestedMode);
          if (requestId !== requestSeq || get().mode !== requestedMode) return; // superseded — discard
          set({ setupAlg, loading: false });
        } catch (err) {
          if (requestId !== requestSeq || get().mode !== requestedMode) return;
          set({ loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      },

      recordTime: (ms) => {
        const { mode, times } = get();
        const updated = [...times[mode], ms].slice(-MAX_TIMES_PER_MODE);
        set({ times: { ...times, [mode]: updated } });
      },

      resetStats: (mode) => {
        set((s) => ({ times: { ...s.times, [mode]: [] } }));
      },
    }),
    {
      name: "cube-timer-trainer",
      // Only the accumulated times are worth persisting — setupAlg/loading
      // are transient session state, always regenerated on load.
      partialize: (s) => ({ times: s.times, mode: s.mode }),
    },
  ),
);
