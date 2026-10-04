import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { validFacelets } from "@/lib/smartcube/stateSync";

/**
 * Keeping the live 3D mimic on the cube's real state.
 *
 * The mimic draws the scramble plus every recorded turn. When a turn is lost
 * over Bluetooth, the store corrects its own picture from the cube's state
 * report (`liveFacelets`) but the recorded turns stay as they were — so the
 * mimic, built from those turns, would show a different cube from the one in
 * your hands, and could never show it solved at the finish. These pure
 * helpers decide when the two have really parted ways and what to draw
 * instead; LiveCubeMimic does the timing and the worker call.
 */

/**
 * How long the facelets must have disagreed with the mimic, unchanged, before
 * it is corrected. The store already holds a disagreeing report for its own
 * settle time before adopting it; this is on top, so a report that is merely
 * ahead of or behind the latest turn never redraws the cube.
 */
export const MIMIC_STABLE_MS = 350;

export type MimicSyncVerdict =
  /** The mimic already shows the cube's state. */
  | "agree"
  /** They differ, but not for long enough yet to be sure it isn't a report in flight. */
  | "wait"
  /** They differ and the cube's reports can't be believed right now (malformed, or flagged unreliable). */
  | "unreliable"
  /** They have differed, unchanged, for the whole stable period: draw the cube's state. */
  | "correct";

export interface MimicSyncInput {
  /** Facelets of what the mimic currently shows. */
  expected: string;
  /** The store's `liveFacelets`. */
  facelets: string;
  /** The store's `faceletsUnreliable`. */
  unreliable: boolean;
  /** How long `expected` and `facelets` have both stayed as they are, in ms. */
  stableForMs: number;
}

export function mimicSyncVerdict({ expected, facelets, unreliable, stableForMs }: MimicSyncInput): MimicSyncVerdict {
  if (expected === facelets) return "agree";
  if (unreliable || !validFacelets(facelets)) return "unreliable";
  return stableForMs >= MIMIC_STABLE_MS ? "correct" : "wait";
}

/** Facelets of a solved cube with `alg` applied. */
export function faceletsOf(alg: string): string {
  return cubeFromAlg(alg).asString();
}

/**
 * A correction already drawn: the mimic shows `setup` (the scramble, the first
 * `base` turns — `prefix` is those turns joined — and the corrective moves)
 * with turns after `base` riding on top.
 */
export interface MimicFix {
  scramble: string;
  setup: string;
  base: number;
  prefix: string;
}

/** What to hand the viewer: its setup alg and the turns on top of it. */
export function mimicView(scramble: string, tokens: readonly string[], fix: MimicFix | null): { setupAlg: string; liveMoves: readonly string[] } {
  if (fix && fix.scramble === scramble && tokens.length >= fix.base && tokens.slice(0, fix.base).join(" ") === fix.prefix) {
    return { setupAlg: fix.setup, liveMoves: tokens.slice(fix.base) };
  }
  return { setupAlg: scramble, liveMoves: tokens };
}

/** The alg whose end state the mimic currently shows. */
export function mimicAlg(setupAlg: string, liveMoves: readonly string[]): string {
  return [setupAlg, ...liveMoves].filter(Boolean).join(" ");
}

/**
 * The moves that take the cube the mimic shows (`shownAlg`) to `facelets`.
 * `computeCorrectiveMoves` goes the other way — from a cube in `actual`
 * facelets to a target alg — so it is asked for the way from the real state
 * back to what the mimic shows, and that route is inverted.
 */
export async function movesToReach(shownAlg: string, facelets: string, correctiveMoves: (target: string, actual: string) => Promise<string[]>): Promise<string[]> {
  const back = await correctiveMoves(shownAlg, facelets);
  const there = invertAlg(back.join(" "));
  return there ? there.split(" ") : [];
}

/** The fix that draws `corrective` after everything the mimic showed (`shownAlg`, which includes all `tokens`). */
export function fixAfter(scramble: string, tokens: readonly string[], shownAlg: string, corrective: readonly string[]): MimicFix {
  return { scramble, setup: mimicAlg(shownAlg, corrective), base: tokens.length, prefix: tokens.join(" ") };
}
