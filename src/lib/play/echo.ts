/**
 * Echo: the classic memory game, played on a cube. The cube shows a run of
 * turns; you play them back from memory; it adds one and goes again. Turns
 * are quarter turns in *grip* notation (what your hands did), each face at
 * most once in a row — a half turn arrives from a smart cube as two quarters,
 * so sequences never contain one, and a repeated face can't be misread.
 */

export const ECHO_TURNS = ["R", "R'", "L", "L'", "U", "U'", "D", "D'", "F", "F'", "B", "B'"] as const;

/** Turns in the very first round. Round n shows n + START_LENGTH - 1. */
export const START_LENGTH = 2;

/** One step of a small, deterministic generator (mulberry32): the value in [0,1) and the next seed. */
export function step(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** The next turn, on a different face from `prev`. */
export function nextTurn(prev: string | null, seed: number): [string, number] {
  const options = ECHO_TURNS.filter((t) => t[0] !== prev?.[0]);
  const [r, next] = step(seed);
  return [options[Math.floor(r * options.length)], next];
}

export interface EchoState {
  phase: "idle" | "show" | "input" | "over";
  seq: string[];
  /** What's been played back this round. */
  input: string[];
  /** Rounds completed. */
  round: number;
  seed: number;
  /** On game over: what it wanted and what it got. */
  miss: { expected: string; got: string } | null;
}

export type EchoAction = { type: "start"; seed: number } | { type: "shown" } | { type: "turn"; grip: string };

export const IDLE: EchoState = { phase: "idle", seq: [], input: [], round: 0, seed: 1, miss: null };

function grow(seq: string[], seed: number): { seq: string[]; seed: number } {
  const [turn, next] = nextTurn(seq[seq.length - 1] ?? null, seed);
  return { seq: [...seq, turn], seed: next };
}

export function echoReduce(state: EchoState, action: EchoAction): EchoState {
  switch (action.type) {
    case "start": {
      let seq: string[] = [];
      let seed = action.seed;
      for (let i = 0; i < START_LENGTH; i++) ({ seq, seed } = grow(seq, seed));
      return { phase: "show", seq, input: [], round: 0, seed, miss: null };
    }
    case "shown":
      return state.phase === "show" ? { ...state, phase: "input" } : state;
    case "turn": {
      if (state.phase !== "input") return state;
      const expected = state.seq[state.input.length];
      if (action.grip !== expected) return { ...state, phase: "over", miss: { expected, got: action.grip } };
      const input = [...state.input, action.grip];
      if (input.length < state.seq.length) return { ...state, input };
      const { seq, seed } = grow(state.seq, state.seed);
      return { ...state, phase: "show", seq, seed, input: [], round: state.round + 1 };
    }
  }
}

/** How long each turn is lit, and the dark beat between turns — quicker as the run gets longer. */
export function showTiming(length: number): { onMs: number; offMs: number } {
  return { onMs: Math.max(260, 640 - 18 * (length - START_LENGTH)), offMs: 150 };
}
