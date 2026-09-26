import { Cube } from "@/lib/cube-engine/engine";

/**
 * Keeping the app's picture of the cube in step with the real one.
 *
 * No smart cube can see its stickers: its firmware counts every turn from
 * the last time it was reset to solved, and most can report that state
 * over Bluetooth (GAN, Giiker, GoCube, QiYi, MoYu's WCU/AI cubes — not the
 * MoYu MHC). So on connect the app asks for it and starts from wherever
 * the cube really is, instead of assuming it's solved; and whenever
 * turning pauses, a report that disagrees with the app's own tally (a turn
 * lost over Bluetooth) corrects it.
 *
 * Reports can arrive around turns — some protocols send one right after
 * each turn, some every few seconds, some only on request — so a
 * disagreeing report is only acted on once the cube has been still for a
 * moment: any turn in the meantime means a fresher report is coming.
 */

const CENTERS = [4, 13, 22, 31, 40, 49];
const FACES = "URFDLB";

/** A full, well-formed state report: 9 stickers of each colour, centres in place, and a real cube. */
export function validFacelets(f: string): boolean {
  if (typeof f !== "string" || f.length !== 54) return false;
  if (CENTERS.some((c, i) => f[c] !== FACES[i])) return false;
  for (const face of FACES) if (f.split(face).length - 1 !== 9) return false;
  try {
    return Cube.fromString(f).asString() === f;
  } catch {
    return false;
  }
}

export interface StateSync {
  /** The first report since connecting hasn't arrived yet. */
  awaitingFirst: boolean;
  /** A report waiting for the cube to go still. */
  pending: string | null;
  /**
   * Whether the cube's reports are believed. Cleared when you tell the app
   * the cube is solved on a cube whose own count can't be reset — until
   * the cube's report agrees again, its old count is wrong, not the app.
   */
  trusted: boolean;
}

export const newStateSync = (): StateSync => ({ awaitingFirst: true, pending: null, trusted: true });

/** A report came in. "adopt": take it now (the first since connecting); "wait": hold it until the cube is still. */
export function onReport(s: StateSync, facelets: string): "adopt" | "wait" | "ignore" {
  if (!validFacelets(facelets)) return "ignore";
  if (s.awaitingFirst) {
    s.awaitingFirst = false;
    return "adopt";
  }
  s.pending = facelets;
  return "wait";
}

/** A turn came in: any held report may be older than it. */
export function onTurn(s: StateSync): void {
  s.pending = null;
}

/** The cube has been still: the held report to correct the app's state with, or null if there's nothing to fix (or it isn't trusted). */
export function settle(s: StateSync, tracked: string): string | null {
  const report = s.pending;
  s.pending = null;
  if (report === null) return null;
  if (report === tracked) {
    s.trusted = true;
    return null;
  }
  return s.trusted ? report : null;
}

/** You've said the cube is solved, and its own count can't be reset: stop believing its reports until they agree. */
export function distrust(s: StateSync): void {
  s.trusted = false;
  s.pending = null;
  s.awaitingFirst = false;
}
