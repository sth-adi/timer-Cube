import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { CFOPSolution } from "@/lib/solvers/cfop";

/** How many past scrambles you can step back through. */
const HISTORY_LIMIT = 50;

interface ScrambleState {
  scramble: string;
  /** Past scrambles, oldest first; `historyIndex` points at the current one. */
  history: string[];
  historyIndex: number;
  engineReady: boolean;
  loadingScramble: boolean;
  crossHint: string[] | null;
  cfopHint: CFOPSolution | null;
  hintLoading: boolean;
  hintError: string | null;
  hintVisible: boolean;
  init: () => Promise<void>;
  nextScramble: () => Promise<void>;
  previousScramble: () => void;
  canGoBack: () => boolean;
  toggleHintVisible: () => void;
  loadCrossHint: () => Promise<void>;
  loadCfopHint: () => Promise<void>;
  clearHints: () => void;
}

// Tracks the in-flight/completed first-scramble bootstrap, so hint loaders
// can await it instead of racing it — see the comment on loadCrossHint.
let initPromise: Promise<void> | null = null;

export const useScrambleStore = create<ScrambleState>((set, get) => ({
  scramble: "",
  history: [],
  historyIndex: -1,
  engineReady: false,
  loadingScramble: false,
  crossHint: null,
  cfopHint: null,
  hintLoading: false,
  hintError: null,
  hintVisible: false,

  init: () => {
    if (!initPromise) {
      initPromise = (async () => {
        const client = getCubeEngineClient();
        set({ loadingScramble: true });
        await client.ready();
        set({ engineReady: true });
        const scramble = await client.generateScramble();
        set({ scramble, history: [scramble], historyIndex: 0, loadingScramble: false });
      })();
    }
    return initPromise;
  },

  nextScramble: async () => {
    const { history, historyIndex } = get();
    // Stepping forward after going back replays the scramble already stored
    // there rather than burning a fresh one, so back/forward is symmetric.
    if (historyIndex >= 0 && historyIndex < history.length - 1) {
      const scramble = history[historyIndex + 1];
      set({
        scramble,
        historyIndex: historyIndex + 1,
        crossHint: null,
        cfopHint: null,
        hintVisible: false,
        hintError: null,
      });
      return;
    }

    const client = getCubeEngineClient();
    set({ loadingScramble: true });
    const scramble = await client.generateScramble();
    const trimmed = [...history, scramble].slice(-HISTORY_LIMIT);
    set({
      scramble,
      history: trimmed,
      historyIndex: trimmed.length - 1,
      loadingScramble: false,
      crossHint: null,
      cfopHint: null,
      hintVisible: false,
      hintError: null,
    });
  },

  previousScramble: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    set({
      scramble: history[historyIndex - 1],
      historyIndex: historyIndex - 1,
      crossHint: null,
      cfopHint: null,
      hintVisible: false,
      hintError: null,
    });
  },

  canGoBack: () => get().historyIndex > 0,

  toggleHintVisible: () => set((s) => ({ hintVisible: !s.hintVisible })),

  loadCrossHint: async () => {
    // The very first scramble is generated asynchronously by init() (the
    // worker has to warm up the solver first, ~1-2s). If hints are revealed
    // before that finishes, `scramble` is still "" — wait for it instead of
    // silently no-op'ing forever with no error and no way to retry.
    await get().init();
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
    await get().init();
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
