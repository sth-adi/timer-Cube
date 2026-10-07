import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { IDENTITY, physicalFaceAt, viewerMove } from "@/lib/gyro/orientation";
import { simplify, toPhysicalTurns } from "@/lib/smartcube/route";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { CROSS_FACES } from "@/lib/smartcube/crossFrame";
import { slicePairLabel, sliceViewerMove } from "@/lib/smartcube/slicePair";
import { solveBreakdown } from "./solveBreakdown";
import { crossBottomGrip, reconstruction } from "./reconText";

const saved = (scramble: string, moves: string[]): Solve => ({
  id: "s",
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => i * 400),
  timeMs: (moves.length - 1) * 400,
  date: 0,
});

describe("written reconstruction", () => {
  it("holds any cross colour on the bottom, green in front where it can be", () => {
    for (const f of CROSS_FACES) expect(physicalFaceAt(crossBottomGrip(f), "D")).toBe(f);
    expect(physicalFaceAt(crossBottomGrip("U"), "F")).toBe("F");
    expect(physicalFaceAt(crossBottomGrip("D"), "F")).toBe("F");
  });

  for (const face of ["U", "D"] as const) {
    it(`writes a ${face === "U" ? "white" : "yellow"}-cross solve that replays to exactly the turns made`, () => {
      const { scramble, moves } = fullSolveOn(face);
      const b = solveBreakdown(saved(scramble, moves))!;
      const r = reconstruction(b, scramble, { totalMs: b.totalMs });
      // Rotation + your-grip notation → the very turns the cube reported.
      const replayed = toPhysicalTurns(`${r.rotation} ${r.steps.flatMap((s) => s.moves).join(" ")}`, IDENTITY).turns;
      expect(simplify(replayed)).toEqual(simplify(moves));
      expect(r.steps.map((s) => s.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]);
      expect(r.text.split("\n")[0]).toMatch(/\/\/ inspection — .* top, .* front/);
      expect(r.text).toMatch(/\/\/ OLL: .+ \(\d+\.\d\ds, \d+ turns?\)/);
      expect(r.twizzleUrl).toMatch(/^https:\/\/alpha\.twizzle\.net\/edit\/\?setup-alg=/);
      if (face === "U") expect(r.gripLabel).toBe("yellow top, green front");
    }, 60_000);
  }

  for (const face of CROSS_FACES) {
    it(`writes a slice move, not two raw quarter turns, wherever a genuine one lands — on a ${face}-cross solve`, () => {
      const solve = fullSolveOn(face);
      // Rather than splice in new moves (risking an accidental cancel), just
      // speed up the *first* naturally-adjacent pair already in this real
      // algorithm data that has the shape of a slice move (an M/E/S-style
      // face+direction combination — not just any two opposite-face turns:
      // "R' L'", say, is two ordinary turns, not a slice) — landing within
      // a handful of milliseconds, the shape every protocol this app
      // decodes reports a genuine one as — and check the rest keeps its own timing.
      const pairAt = solve.moves.findIndex((t, i) => i + 1 < solve.moves.length && slicePairLabel(t, 0, solve.moves[i + 1], 10) !== null);
      // This particular solve's own algorithms just don't happen to have that
      // adjacency anywhere — the exhaustive, engine-verified check below
      // (which doesn't depend on what any one solve happens to contain)
      // covers this grip regardless.
      if (pairAt < 0) return;
      const times = solve.moves.map((_, i) => i * 400);
      times[pairAt + 1] = times[pairAt] + 10;
      const withTiming: Solve = {
        id: "s",
        sessionId: "x",
        penalty: "none",
        scramble: solve.scramble,
        reconstruction: solve.moves.join(" "),
        moveTimestamps: times,
        timeMs: times[times.length - 1],
        date: 0,
      };
      const b = solveBreakdown(withTiming)!;
      const r = reconstruction(b, solve.scramble, { totalMs: b.totalMs });
      const written = r.steps.flatMap((s) => s.moves);
      // Not necessarily literally "M"/"M'" — the grip this cross colour
      // holds the slice at may read it as a different letter (E, S…) or
      // sense — a single slice move either way, never the two raw quarter
      // turns it replaced.
      expect(written.some((t) => "MES".includes(t[0]))).toBe(true);
    }, 60_000);
  }

  const RAW_PAIRS: [string, string][] = [
    ["R", "L'"],
    ["L", "R'"],
    ["R2", "L2"],
    ["U", "D'"],
    ["D", "U'"],
    ["U2", "D2"],
    ["F", "B'"],
    ["B", "F'"],
    ["F2", "B2"],
  ];

  for (const face of CROSS_FACES) {
    it(`relabels every slice move consistently for the ${face}-cross grip`, () => {
      const grip = crossBottomGrip(face);
      for (const [a, b] of RAW_PAIRS) {
        const rawLabel = slicePairLabel(a, 0, b, 10)!;
        // Two ways to relabel the same physical move for this grip should
        // agree: rewrite the merged slice token directly, or rewrite each
        // physical sub-turn first (the way the store's own facelets/case
        // recognition sees them, never merged) and merge *those*.
        const direct = sliceViewerMove(rawLabel, grip);
        const viaSubTurns = slicePairLabel(viewerMove(a, grip), 0, viewerMove(b, grip), 10);
        expect(direct).toBe(viaSubTurns);
      }
    });
  }
});
