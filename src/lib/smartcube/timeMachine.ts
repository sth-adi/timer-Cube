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

/**
 * How far past MAX_ENTRIES the buffer may grow before the oldest turns are
 * dropped in one go. Trimming every turn at the cap would copy ~20,000
 * entries per turn inside the Bluetooth handler; trimming in batches makes
 * recording O(1) amortised while readers still never see more than MAX_ENTRIES.
 */
const TRIM_SLACK = 2_000;

/** Chronological, oldest first. May hold up to TRIM_SLACK entries beyond the cap; only the newest MAX_ENTRIES are visible. */
let buffer: TimeMachineEntry[] = [];
/** Bumped on every change, so subscribers and snapshot caches can tell "same log" from "new log" without comparing entries. */
let version = 0;
/** The visible log as a plain array, built lazily on read (the turn handler never reads it) and reused until the next change. */
let snapshot: { version: number; entries: readonly TimeMachineEntry[] } | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  for (const l of listeners) {
    try {
      l();
    } catch {
      // A subscriber's failure must not stop the cube's turn being recorded for the others.
    }
  }
}

export function recordTimeMachineMove(token: string, atMs: number): void {
  buffer.push({ token, atMs, wallMs: Date.now() });
  if (buffer.length > MAX_ENTRIES + TRIM_SLACK) buffer.splice(0, buffer.length - MAX_ENTRIES);
  notify();
}

export function resetTimeMachine(): void {
  buffer = [];
  notify();
}

/** The log, oldest first, at most MAX_ENTRIES long. The same array is returned until the log changes (a new one after), so it works as a useSyncExternalStore snapshot. */
export function getTimeMachineLog(): readonly TimeMachineEntry[] {
  if (!snapshot || snapshot.version !== version) {
    snapshot = { version, entries: buffer.length > MAX_ENTRIES ? buffer.slice(buffer.length - MAX_ENTRIES) : buffer.slice() };
  }
  return snapshot.entries;
}

/** Changes whenever the log does — a cheap "has it changed?" for callers that don't want to hold the array. */
export function getTimeMachineVersion(): number {
  return version;
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
