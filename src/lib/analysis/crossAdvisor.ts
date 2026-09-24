import type { Solve } from "@/types";
import { Cube } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";

/**
 * Cross Color Advisor: this app always solves the cross on white (U) — a
 * fixed convention, not a choice the cuber makes per scramble (see
 * engine.ts). But "how long would the cross have been if you'd started on
 * a different color" is a well-defined, purely computed question for any
 * scramble you already have: rotate the *scrambled* cube as a whole (a
 * cube rotation moves every piece together, so it's exactly "look at the
 * same scramble from a different side") and read the exact optimal cross
 * length for whichever face is now up, off the same exhaustive table
 * crossHeuristic already uses — a lookup, not a search, so this is cheap
 * even over hundreds of scrambles.
 *
 * Needs only a scramble, so it works for every solve, keyboard-timed ones
 * included — not only smart-cube captures.
 */

const FACE_COLOR: Record<string, string> = { U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue" };

/** The whole-cube rotation that brings each face to U, and which original face ends up there — verified empirically below rather than hand-derived. */
const ORIENTATIONS = (["", "x", "x2", "x'", "z", "z'"] as const).map((move) => {
  const c = new Cube();
  if (move) c.move(move);
  return { move, face: c.asString()[4] };
});

export interface OrientationStat {
  face: string;
  colorName: string;
  avgLen: number;
  scrambles: number;
}

export interface CrossAdvisorReport {
  /** What this app actually solves on — always white. */
  current: OrientationStat;
  best: OrientationStat;
  /** All 6, sorted shortest first. */
  all: OrientationStat[];
  headline: string;
}

export const MIN_SCRAMBLES = 15;

export function analyzeCrossOrientations(solves: readonly Solve[]): CrossAdvisorReport | null {
  const scrambles = solves.filter((s) => s.scramble && s.penalty !== "dnf").map((s) => s.scramble);
  if (scrambles.length < MIN_SCRAMBLES) return null;

  const totals = ORIENTATIONS.map(() => 0);
  for (const scramble of scrambles) {
    const cube = new Cube();
    cube.move(scramble);
    ORIENTATIONS.forEach((o, i) => {
      const rotated = cube.clone();
      if (o.move) rotated.move(o.move);
      totals[i] += crossHeuristic(rotated);
    });
  }

  const stats: OrientationStat[] = ORIENTATIONS.map((o, i) => ({
    face: o.face,
    colorName: FACE_COLOR[o.face] ?? o.face,
    avgLen: totals[i] / scrambles.length,
    scrambles: scrambles.length,
  }));
  const all = [...stats].sort((a, b) => a.avgLen - b.avgLen);
  const current = stats.find((s) => s.face === "U")!;
  const best = all[0];

  const parts: string[] = [];
  parts.push(`Over your last ${scrambles.length} scrambles, a white cross averages ${current.avgLen.toFixed(2)} moves.`);
  if (best.face !== "U" && current.avgLen - best.avgLen >= 0.3) {
    parts.push(`A ${best.colorName} cross would have averaged ${best.avgLen.toFixed(2)} — ${(current.avgLen - best.avgLen).toFixed(2)} moves shorter, on these same scrambles.`);
  } else {
    parts.push("White is already at or near the shortest option for you — no color is meaningfully better.");
  }

  return { current, best, all, headline: parts.join(" ") };
}
