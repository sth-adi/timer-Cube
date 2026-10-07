/**
 * Pure pieces of the connection moment: the short turn sequence the little cube plays while the link
 * comes up, the three words the status line walks, and the battery as whole segments. Nothing here adds
 * a connection state; the screen still reads the store's own (see connectSteps.ts).
 */
import { FACES_IN_ORDER, applyTurn } from "@/lib/cube-engine/stickerTurns";
import type { ConnectStep } from "./connectSteps";

export const SOLVED_FACELETS = FACES_IN_ORDER.map((f) => f.repeat(9)).join("");

/** The sequence the cube plays: a right-hand trigger, familiar to anyone holding a cube. */
export const CONNECT_ALG = ["R", "U", "R'", "U'"] as const;

/** The three lines the status walks, in order. */
export const CONNECT_LINES = ["Connecting", "Reading cube", "Ready"] as const;
export type ConnectLine = (typeof CONNECT_LINES)[number];

/** The same turns undone: reversed order, each flipped. */
export function invertAlg(alg: readonly string[]): string[] {
  return [...alg].reverse().map((t) => (t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`));
}

/**
 * Cube states for playing `alg` so that it ends exactly on `end` (the real state, or solved when it
 * isn't known yet): the first frame is `end` with the alg undone, then one frame per turn. Turn
 * animation reads each change between frames as one layer turning.
 */
export function scriptFrames(end: string, alg: readonly string[] = CONNECT_ALG): string[] {
  let state = end;
  for (const t of invertAlg(alg)) state = applyTurn(state, t);
  const frames = [state];
  for (const t of alg) {
    state = applyTurn(state, t);
    frames.push(state);
  }
  return frames;
}

/**
 * Frames for a cube that keeps repeating `alg` from solved: the trigger has order six, so after six
 * repeats the cube is solved again and the loop closes with no jump. Frame 0 and the last are both solved.
 */
export function loopFrames(alg: readonly string[] = CONNECT_ALG, repeats = 6): string[] {
  let state = SOLVED_FACELETS;
  const frames = [state];
  for (let r = 0; r < repeats; r++)
    for (const t of alg) {
      state = applyTurn(state, t);
      frames.push(state);
    }
  return frames;
}

/**
 * While connecting: the browser's list and the address read both still count as "Connecting"; once the
 * link is open and being verified the cube is being read.
 */
export function connectLine(step: ConnectStep): ConnectLine {
  return step >= 2 ? "Reading cube" : "Connecting";
}

/** The cube reads "Reading cube" for at least this long after connecting (the turns take about this to play). */
export const READY_AFTER_MS = 700;
/** ...and waits for the battery reading no longer than this before saying Ready anyway. */
export const READY_WAIT_BATTERY_MS = 1600;

/** The moment after connecting: "Reading cube" while the turns play and the battery is asked for, then "Ready". */
export function readyLine(elapsedMs: number, batteryPending: boolean): ConnectLine {
  if (elapsedMs < READY_AFTER_MS) return "Reading cube";
  return batteryPending && elapsedMs < READY_WAIT_BATTERY_MS ? "Reading cube" : "Ready";
}

/** How long the connected moment stays up. */
export const READY_MOMENT_MS = 2600;

/** Whole filled segments of a battery bar (at least one while any charge is left); null when the level is unknown. */
export function batterySegments(level: number | null, count = 5): number | null {
  if (level === null || !Number.isFinite(level)) return null;
  const clamped = Math.max(0, Math.min(100, level));
  if (clamped === 0) return 0;
  return Math.max(1, Math.round((clamped / 100) * count));
}
