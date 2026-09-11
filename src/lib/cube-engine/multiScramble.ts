/**
 * Scramble text for 2x2/4x4/5x5 sessions. `cubing/scramble` (the obvious
 * first choice — it ships genuine WCA random-*state* scrambles for every
 * event) instantiates a dedicated web worker from inside its own npm
 * package, and every fallback strategy it tries for that
 * (`import.meta.resolve`, the esbuild workaround, `new URL(..., import.meta.url)`)
 * fails to resolve under this app's bundler — confirmed live: every attempt
 * throws "Module worker instantiation failed. There are no more fallbacks
 * available." So this generates random-*move* scrambles instead, the same
 * honest approach `practiceScramble.ts` already uses for 3x3 "not WCA-legal"
 * practice scrambles: real, properly-notated moves for the puzzle's actual
 * move set, redundant repeats avoided, just not guaranteed to land on a
 * uniformly random state the way a competition scramble does.
 */

import type { WcaEvent } from "@/types";
import { moveLabel } from "../solvers/moveNotation";

interface EventScrambleShape {
  length: number;
  /** Whether this puzzle has a distinct wide (2-layer) turn in addition to the outer-layer one. */
  wide: boolean;
}

const SHAPE: Record<Exclude<WcaEvent, "333">, EventScrambleShape> = {
  "222": { length: 11, wide: false },
  "444": { length: 40, wide: true },
  "555": { length: 60, wide: true },
};

/** Uppercases the outer-layer letter into its wide-turn form (R -> Rw), preserving any '/2 suffix. */
function toWide(move: string): string {
  const face = move[0];
  const suffix = move.slice(1);
  return `${face}w${suffix}`;
}

/**
 * Generates `length` random turns for the given event, avoiding same-face
 * and same-axis repeats back to back (the same redundancy rule the solvers'
 * own search uses — see idaStar.ts), each turn independently a 50/50 chance
 * of being an outer-layer or a wide turn when the puzzle has both.
 */
export async function generateScrambleForEvent(event: Exclude<WcaEvent, "333">): Promise<string> {
  const { length, wide } = SHAPE[event];
  const moves: string[] = [];
  let lastFace = -1;
  for (let i = 0; i < length; i++) {
    let face: number;
    do {
      face = Math.floor(Math.random() * 6);
    } while (face === lastFace || face % 3 === lastFace % 3);
    const power = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const outer = moveLabel(face, power);
    moves.push(wide && Math.random() < 0.5 ? toWide(outer) : outer);
    lastFace = face;
  }
  return moves.join(" ");
}
