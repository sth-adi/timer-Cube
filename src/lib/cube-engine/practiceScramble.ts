/**
 * A random-*move* scramble generator — deliberately separate from
 * `generateScramble333` in engine.ts, which produces the WCA-legal
 * random-*state* scrambles used everywhere else in this app. This one exists
 * for practicing a specific move count (a long one to drill lookahead, a
 * short one to isolate a single stage), and is never presented as WCA-legal
 * anywhere in the UI — random-move and random-state scrambles have different
 * statistical properties, and only the latter is what competitions actually
 * use.
 */

import { moveLabel } from "../solvers/moveNotation";

export const PRACTICE_SCRAMBLE_LENGTHS = [12, 15, 20, 25, 30, 40] as const;
export type PracticeScrambleLength = (typeof PRACTICE_SCRAMBLE_LENGTHS)[number];

export const DEFAULT_PRACTICE_LENGTH: PracticeScrambleLength = 25;

/**
 * Generates `length` random face turns, avoiding two turns in a row that
 * would be redundant: the same face twice (which always collapses to one
 * move or nothing) and consecutive turns on the same axis (U/D, R/L, F/B) —
 * not strictly redundant on their own, but the same axis-avoidance rule the
 * solvers themselves use to keep a search from wasting moves (see
 * idaStar.ts), applied here just to keep the scramble from reading as
 * repetitive.
 */
export function generatePracticeScramble(length: number): string {
  const moves: string[] = [];
  let lastFace = -1;
  for (let i = 0; i < length; i++) {
    let face: number;
    do {
      face = Math.floor(Math.random() * 6);
    } while (face === lastFace || face % 3 === lastFace % 3);
    const power = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    moves.push(moveLabel(face, power));
    lastFace = face;
  }
  return moves.join(" ");
}
