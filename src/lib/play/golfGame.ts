import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { countStrokes, type Hole } from "./golf";

/**
 * The round of Cube Golf as a pure state machine — the page feeds it turns
 * together with the cube's state after each one, so what counts as "holed"
 * is decided by the cube itself, not by how you got there.
 *
 *   loading → reset (cube not solved yet) → setup (scramble it) → play → holed
 *
 * `setup` ends the instant the cube reads as the scramble's exact state, by
 * any route; `play` ends the instant it reads solved.
 */

/** Par for each hole of a round: a warm-up, then up to seven turns. */
export const ROUND_PARS = [3, 4, 4, 5, 6, 7] as const;
/** What skipping a hole costs over par. */
export const SKIP_PENALTY = 3;

export type GolfHole = Hole & { /** The cube's state once the scramble is done. */ target: string };

export interface HoleResult {
  par: number;
  strokes: number;
  skipped: boolean;
}

export interface GolfState {
  phase: "menu" | "loading" | "reset" | "setup" | "play" | "holed" | "card";
  seed: number;
  index: number;
  hole: GolfHole | null;
  /** Turns made since the hole began, through the scramble. */
  setupTurns: string[];
  /** Turns made since the scramble finished. */
  playTurns: string[];
  results: HoleResult[];
}

export const MENU: GolfState = { phase: "menu", seed: 1, index: 0, hole: null, setupTurns: [], playTurns: [], results: [] };

export type GolfAction =
  | { type: "start"; seed: number }
  | { type: "hole"; hole: Hole; facelets: string }
  | { type: "turn"; token: string; facelets: string }
  /** "My cube is solved" — for when the app's picture of it drifted. */
  | { type: "confirmSolved" }
  | { type: "skip" }
  | { type: "next" }
  | { type: "menu" };

export function withTarget(hole: Hole): GolfHole {
  return { ...hole, target: cubeFromAlg(hole.scramble.join(" ")).asString() };
}

export function golfReduce(state: GolfState, action: GolfAction): GolfState {
  switch (action.type) {
    case "start":
      return { ...MENU, phase: "loading", seed: action.seed };
    case "hole":
      return { ...state, phase: action.facelets === SOLVED_FACELETS ? "setup" : "reset", hole: withTarget(action.hole), setupTurns: [], playTurns: [] };
    case "turn": {
      if (!state.hole) return state;
      if (state.phase === "reset") return action.facelets === SOLVED_FACELETS ? { ...state, phase: "setup", setupTurns: [] } : state;
      if (state.phase === "setup") {
        const setupTurns = [...state.setupTurns, action.token];
        return action.facelets === state.hole.target ? { ...state, phase: "play", setupTurns, playTurns: [] } : { ...state, setupTurns };
      }
      if (state.phase === "play") {
        const playTurns = [...state.playTurns, action.token];
        if (action.facelets !== SOLVED_FACELETS) return { ...state, playTurns };
        return {
          ...state,
          phase: "holed",
          playTurns,
          results: [...state.results, { par: state.hole.par, strokes: countStrokes(playTurns), skipped: false }],
        };
      }
      return state;
    }
    case "confirmSolved":
      return state.phase === "reset" ? { ...state, phase: "setup", setupTurns: [] } : state;
    case "skip": {
      if (!state.hole || state.phase === "holed" || state.phase === "card" || state.phase === "menu" || state.phase === "loading") return state;
      return { ...state, phase: "holed", results: [...state.results, { par: state.hole.par, strokes: state.hole.par + SKIP_PENALTY, skipped: true }] };
    }
    case "next":
      if (state.phase !== "holed") return state;
      return state.index + 1 < ROUND_PARS.length ? { ...state, phase: "loading", index: state.index + 1, hole: null, setupTurns: [], playTurns: [] } : { ...state, phase: "card" };
    case "menu":
      return MENU;
  }
}

/** Total strokes over par across the holes played so far. */
export function totalOverPar(results: readonly HoleResult[]): number {
  return results.reduce((sum, r) => sum + (r.strokes - r.par), 0);
}
