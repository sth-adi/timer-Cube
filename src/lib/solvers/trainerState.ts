import { Cube, generateScramble333 } from "../cube-engine/engine";
import { solveCrossOptimal } from "./cross";
import { solveF2L } from "./f2l";
import { solveOLL } from "./oll";

export type TrainerMode = "oll" | "pll";

export interface TrainerState {
  /** Applied to a solved cube (as `experimentalSetupAlg`), this reproduces the practice state. */
  setupAlg: string;
}

// solveOLL's from-scratch search only succeeds on a minority of scrambles
// within its (deliberately bounded, hang-safe) budget — see cfop.ts's own
// fallback for the full story. Rather than reuse that fallback (which, once
// triggered, jumps straight to a fully-solved state with no "oriented but
// not permuted" checkpoint — useless for a PLL trainer), just try fresh
// scrambles until one succeeds from scratch. Bounded so a freak run of
// failures can't hang the UI.
const MAX_ATTEMPTS = 12;

/**
 * Builds a last-layer practice state from a genuine random scramble, reusing
 * the app's own (already-verified) cross/F2L/OLL solvers rather than any
 * hand-typed algorithm data — so it's guaranteed reachable and correct by
 * construction. "oll" mode solves cross+F2L only (last layer's orientation
 * *and* permutation are left random, matching real OLL-recognition
 * practice). "pll" mode additionally orients the last layer, leaving only
 * its permutation to practice.
 */
export function buildTrainerState(mode: TrainerMode): TrainerState {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const scramble = generateScramble333();
    const cube = new Cube();
    cube.move(scramble);

    const cross = solveCrossOptimal(scramble);
    if (cross.length > 0) cube.move(cross.join(" "));

    const f2l = solveF2L(cube);
    const parts = [scramble, cross.join(" "), f2l.flatMap((p) => p.moves).join(" ")];

    if (mode === "oll") {
      return { setupAlg: parts.filter(Boolean).join(" ") };
    }

    try {
      const oll = solveOLL(cube);
      parts.push(oll.join(" "));
      return { setupAlg: parts.filter(Boolean).join(" ") };
    } catch {
      // Rare from-scratch OLL search failure — try a fresh scramble.
    }
  }
  throw new Error("Could not generate a PLL practice state — please try again.");
}
