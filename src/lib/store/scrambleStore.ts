import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { generateScrambleForEvent } from "@/lib/cube-engine/multiScramble";
import type { CFOPSolution } from "@/lib/solvers/cfop";
import type { WcaEvent } from "@/types";
import {
  DEFAULT_PRACTICE_LENGTH,
  generatePracticeScramble,
  type PracticeScrambleLength,
} from "@/lib/cube-engine/practiceScramble";

/** Generates a scramble for the given event — 3x3 is a genuine WCA-legal random-state scramble via this app's own worker (which also powers cross/CFOP hints); other sizes are random-move scrambles (see multiScramble.ts for why). */
async function generateForEvent(event: WcaEvent): Promise<string> {
  if (event === "333") return getCubeEngineClient().generateScramble();
  return generateScrambleForEvent(event);
}

/** How many past scrambles you can step back through. */
const HISTORY_LIMIT = 50;

interface ScrambleState {
  scramble: string;
  /** Past scrambles, oldest first; `historyIndex` points at the current one. */
  history: string[];
  historyIndex: number;
  engineReady: boolean;
  loadingScramble: boolean;
  /** Which puzzle the current scramble (and any future one from `nextScramble`) is for — follows the active session. */
  event: WcaEvent;
  /** Switches the puzzle being scrambled for, clearing history and loading a fresh scramble for it. A no-op if already on that event. */
  setEvent: (event: WcaEvent) => Promise<void>;
  /**
   * When on, `nextScramble` generates a random-*move* practice scramble of
   * `practiceLength` moves instead of the WCA-legal random-state one — see
   * cube-engine/practiceScramble.ts for why those are a different thing.
   * Off by default, and the very first scramble on app load is always the
   * real WCA one regardless of this.
   */
  practiceMode: boolean;
  practiceLength: number;
  setPracticeMode: (v: boolean) => void;
  setPracticeLength: (v: PracticeScrambleLength) => void;
  /**
   * Loads a scramble that came from outside the normal flow (a challenge
   * link from someone else) as the current one, recorded into history like
   * any other so it can still be stepped back to.
   */
  loadExternalScramble: (scramble: string) => void;
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

/**
 * Every action that decides what the current scramble is (init, setEvent,
 * nextScramble, previousScramble, loadExternalScramble) takes a new request
 * number. A generated scramble is only applied if its request is still the
 * latest when it arrives — so a slow generation can never replace the
 * scramble of a newer selection (say, the 4x4 you switched to while the
 * first 3x3 was still being generated).
 */
let latestRequest = 0;
const claimRequest = () => ++latestRequest;
const isLatest = (request: number) => request === latestRequest;

/** Clears everything derived from the previous scramble. */
const FRESH_HINTS = { crossHint: null, cfopHint: null, hintVisible: false, hintError: null, hintLoading: false } as const;

/** Test-only: forget the bootstrap so each test starts from a cold store. */
export function resetScrambleRequestsForTests() {
  initPromise = null;
  latestRequest = 0;
}

export const useScrambleStore = create<ScrambleState>((set, get) => ({
  scramble: "",
  history: [],
  historyIndex: -1,
  engineReady: false,
  loadingScramble: false,
  event: "333",
  crossHint: null,
  cfopHint: null,
  hintLoading: false,
  hintError: null,
  hintVisible: false,
  practiceMode: false,
  practiceLength: DEFAULT_PRACTICE_LENGTH,

  setPracticeMode: (practiceMode) => set({ practiceMode }),
  setPracticeLength: (practiceLength) => set({ practiceLength }),

  loadExternalScramble: (scramble) => {
    const { history } = get();
    const trimmed = [...history, scramble].slice(-HISTORY_LIMIT);
    claimRequest();
    set({ scramble, history: trimmed, historyIndex: trimmed.length - 1, loadingScramble: false, ...FRESH_HINTS });
  },

  init: () => {
    if (!initPromise) {
      initPromise = (async () => {
        // Always warms the 3x3 engine and opens on a 3x3 scramble — the
        // default session is always 3x3, and this is what loadCrossHint/
        // loadCfopHint await for engine readiness. setEvent (called by
        // sessionStore once the active session is known) takes it from here
        // if that session turns out to be a different puzzle.
        const request = claimRequest();
        const client = getCubeEngineClient();
        set({ loadingScramble: true });
        try {
          await client.ready();
          set({ engineReady: true });
          const scramble = await client.generateScramble();
          if (isLatest(request)) set({ scramble, history: [scramble], historyIndex: 0, loadingScramble: false });
        } catch (err) {
          if (isLatest(request)) set({ loadingScramble: false });
          throw err;
        }
      })();
    }
    return initPromise;
  },

  setEvent: async (event) => {
    if (get().event === event) return;
    const request = claimRequest();
    set({ event, loadingScramble: true, ...FRESH_HINTS });
    try {
      const scramble = await generateForEvent(event);
      if (isLatest(request)) set({ scramble, history: [scramble], historyIndex: 0, loadingScramble: false });
    } catch (err) {
      if (isLatest(request)) set({ loadingScramble: false });
      throw err;
    }
  },

  nextScramble: async () => {
    // Advancing is disabled while a scramble is being generated: a second
    // press would otherwise skip past the one on its way, or append to a
    // history that's about to change underneath it.
    if (get().loadingScramble) return;
    const { history, historyIndex } = get();
    // Stepping forward after going back replays the scramble already stored
    // there rather than burning a fresh one, so back/forward is symmetric.
    if (historyIndex >= 0 && historyIndex < history.length - 1) {
      claimRequest();
      set({ scramble: history[historyIndex + 1], historyIndex: historyIndex + 1, ...FRESH_HINTS });
      return;
    }

    const request = claimRequest();
    const { practiceMode, practiceLength, event } = get();
    set({ loadingScramble: true });
    try {
      const scramble =
        event === "333" && practiceMode ? generatePracticeScramble(practiceLength) : await generateForEvent(event);
      // Superseded (the event changed, you went back, a challenge link
      // loaded): that selection owns the scramble now — drop this one.
      if (!isLatest(request)) return;
      const trimmed = [...get().history, scramble].slice(-HISTORY_LIMIT);
      set({ scramble, history: trimmed, historyIndex: trimmed.length - 1, loadingScramble: false, ...FRESH_HINTS });
    } catch (err) {
      if (isLatest(request)) set({ loadingScramble: false });
      throw err;
    }
  },

  previousScramble: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    // Going back is always allowed, and cancels a generation still in flight.
    claimRequest();
    set({ scramble: history[historyIndex - 1], historyIndex: historyIndex - 1, loadingScramble: false, ...FRESH_HINTS });
  },

  canGoBack: () => get().historyIndex > 0,

  toggleHintVisible: () => set((s) => ({ hintVisible: !s.hintVisible })),

  loadCrossHint: async () => {
    // Cross/CFOP solving only exists for 3x3 — HintPanel already hides
    // itself for other events, this is just a defensive backstop.
    if (get().event !== "333") return;
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
      // The scramble moved on while this was solving: the hint is for a different cube.
      if (get().scramble !== scramble) return;
      set({ crossHint: moves, hintLoading: false });
    } catch (err) {
      if (get().scramble !== scramble) return;
      set({ hintLoading: false, hintError: err instanceof Error ? err.message : String(err) });
    }
  },

  loadCfopHint: async () => {
    if (get().event !== "333") return;
    await get().init();
    const { scramble, cfopHint } = get();
    if (cfopHint || !scramble) return;
    set({ hintLoading: true, hintError: null });
    try {
      const solution = await getCubeEngineClient().solveCFOP(scramble);
      // The scramble moved on while this was solving: the hint is for a different cube.
      if (get().scramble !== scramble) return;
      set({ cfopHint: solution, hintLoading: false });
    } catch (err) {
      if (get().scramble !== scramble) return;
      set({ hintLoading: false, hintError: err instanceof Error ? err.message : String(err) });
    }
  },

  clearHints: () => set(FRESH_HINTS),
}));
