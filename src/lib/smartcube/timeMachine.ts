import { newCube } from "@/lib/cube-engine/engine";
import { invertMoves } from "@/lib/xray/common";
import { simplify } from "./route";

/**
 * Cube Time Machine: every turn the connected cube has made since it was
 * connected — scrambles, solves, idle fiddling, alg experiments — kept as a
 * timeline you can jump back to. Because the cube's state is fully
 * determined by its turn history from the (solved) connect state, *any*
 * earlier moment can be restored: the way back is just the turns since
 * then, undone — or, for a long way back, the shortest route the solver
 * can find between the two states.
 */

export interface TimeMachineEntry {
  token: string;
  /** The move stream's own clock. */
  atMs: number;
  /** Wall-clock time, for "3 min ago" labels. */
  wallMs: number;
}

/** A pause at least this long ends one burst of turning and starts the next — the natural "moments" on the timeline. */
export const MOMENT_GAP_MS = 1500;
/** Keeps memory bounded on a cube left connected all day. */
export const MAX_ENTRIES = 20_000;

let log: TimeMachineEntry[] = [];
const listeners = new Set<() => void>();

export function recordTimeMachineMove(token: string, atMs: number): void {
  log = log.length >= MAX_ENTRIES ? [...log.slice(1), { token, atMs, wallMs: Date.now() }] : [...log, { token, atMs, wallMs: Date.now() }];
  for (const l of listeners) l();
}

export function resetTimeMachine(): void {
  log = [];
  for (const l of listeners) l();
}

export function getTimeMachineLog(): readonly TimeMachineEntry[] {
  return log;
}

export function subscribeTimeMachine(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface Moment {
  /** Number of turns applied at this moment (0 = the connect state). */
  count: number;
  wallMs: number;
  /** Turns in the burst that ended here. */
  burstTurns: number;
  burstMs: number;
  /** Whether the cube was solved at this moment. */
  solved: boolean;
  facelets: string;
}

/**
 * The timeline's snapshots: the connect state, then the end of every burst
 * of turning (a pause of MOMENT_GAP_MS or more ends a burst). Solved states
 * are flagged — they're the ones people most often want back.
 */
export function buildMoments(entries: readonly TimeMachineEntry[]): Moment[] {
  const cube = newCube();
  const moments: Moment[] = [{ count: 0, wallMs: entries[0]?.wallMs ?? Date.now(), burstTurns: 0, burstMs: 0, solved: true, facelets: cube.asString() }];
  let burstStart = 0;
  for (let i = 0; i < entries.length; i++) {
    cube.move(entries[i].token);
    const next = entries[i + 1];
    if (!next || next.atMs - entries[i].atMs >= MOMENT_GAP_MS) {
      moments.push({
        count: i + 1,
        wallMs: entries[i].wallMs,
        burstTurns: i + 1 - burstStart,
        burstMs: entries[i].atMs - entries[burstStart].atMs,
        solved: cube.isSolved(),
        facelets: cube.asString(),
      });
      burstStart = i + 1;
    }
  }
  return moments;
}

/** The literal way back to the state after `count` turns: everything since, undone in reverse (with same-face turns merged). */
export function undoRoute(entries: readonly TimeMachineEntry[], count: number): string[] {
  return simplify(invertMoves(entries.slice(count).map((e) => e.token)));
}

/** The turns that produced the state after `count` turns, from the (solved) connect state — the target for a shortest-route search. */
export function sequenceTo(entries: readonly TimeMachineEntry[], count: number): string {
  return entries
    .slice(0, count)
    .map((e) => e.token)
    .join(" ");
}
