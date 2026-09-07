import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { CFOPSolution } from "@/lib/solvers/cfop";

interface ScrambleState {
  scramble: string;
  engineReady: boolean;
  loadingScramble: boolean;
  crossHint: string[] | null;
  cfopHint: CFOPSolution | null;
  hintLoading: boolean;
  hintError: string | null;
  hintVisible: boolean;
  init: () => Promise<void>;
  nextScramble: () => Promise<void>;
  toggleHintVisible: () => void;
  loadCrossHint: () => Promise<void>;
  loadCfopHint: () => Promise<void>;
  clearHints: () => void;
}

export const useScrambleStore = create<ScrambleState>((set, get) => ({
  scramble: "",
  engineReady: false,
  loadingScramble: false,
  crossHint: null,
  cfopHint: null,
  hintLoading: false,
  hintError: null,
  hintVisible: false,

  init: async () => {
    const client = getCubeEngineClient();
    set({ loadingScramble: true });
    await client.ready();
    set({ engineReady: true });
    const scramble = await client.generateScramble();
    set({ scramble, loadingScramble: false });
  },

  nextScramble: async () => {
    const client = getCubeEngineClient();
    set({ loadingScramble: true });
    const scramble = await client.generateScramble();
    set({ scramble, loadingScramble: false, crossHint: null, cfopHint: null, hintVisible: false, hintError: null });
  },

  toggleHintVisible: () => set((s) => ({ hintVisible: !s.hintVisible })),

  loadCrossHint: async () => {
    const { scramble, crossHint } = get();
    if (crossHint || !scramble) return;
    set({ hintLoading: true, hintError: null });
    try {
      const moves = await getCubeEngineClient().solveCross(scramble);
      set({ crossHint: moves, hintLoading: false });
    } catch (err) {
      set({ hintLoading: false, hintError: err instanceof Error ? err.message : String(err) });
    }
  },

  loadCfopHint: async () => {
    const { scramble, cfopHint } = get();
    if (cfopHint || !scramble) return;
    set({ hintLoading: true, hintError: null });
    try {
      const solution = await getCubeEngineClient().solveCFOP(scramble);
      set({ cfopHint: solution, hintLoading: false });
    } catch (err) {
      set({ hintLoading: false, hintError: err instanceof Error ? err.message : String(err) });
    }
  },

  clearHints: () => set({ crossHint: null, cfopHint: null, hintVisible: false, hintError: null }),
}));
