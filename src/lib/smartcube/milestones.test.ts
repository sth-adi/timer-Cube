import { describe, expect, it } from "vitest";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CROSS_FACES, relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";
import { fullSolveOn } from "./testSolves";
import { NO_MILESTONES, advanceMilestones, type Milestones } from "./milestones";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { F2L_PAIRS } from "@/lib/solvers/data/pieceTablesClient";
import { solvePairFromCube } from "@/lib/solvers/f2l";
import { buildPostSolveRows } from "@/lib/analysis/postSolveTable";

function run(moves: readonly string[], SCRAMBLE: string, opts: { finished?: boolean } = {}): Milestones {
  const live = newCube();
  live.move(SCRAMBLE);
  const frames = Object.fromEntries(
    CROSS_FACES.map((f) => {
      const c = newCube();
      c.move(toCrossFrame(SCRAMBLE.split(" "), f).join(" "));
      return [f, c];
    }),
  ) as Record<CrossFace, CubeJSInstance>;
  let m = NO_MILESTONES;
  moves.forEach((t, i) => {
    live.move(t);
    for (const f of CROSS_FACES) frames[f].move(relabelMove(t, f));
    m = advanceMilestones(m, live, (f) => frames[f], (i + 1) * 100);
  });
  if (opts.finished ?? true) expect(live.isSolved()).toBe(true);
  return m;
}

describe("live milestones", () => {
  for (const face of ["U", "D", "F"] as const) {
    it(`splits a ${face}-cross solve into every CFOP step`, () => {
      const solve = fullSolveOn(face);
      const m = run(solve.moves, solve.scramble);
      expect(m.crossFace).toBe(face);
      expect(m.crossAtMs).not.toBeNull();
      expect(m.f2lPairAtMs.every((x) => x !== null)).toBe(true);
      expect(m.f2lAtMs).toBe(Math.max(...(m.f2lPairAtMs as number[])));
      expect(m.ollAtMs).toBeGreaterThanOrEqual(m.f2lAtMs!);
      expect(m.ollCaseName).not.toBeNull();
      expect(m.pllCaseName).not.toBeNull();
      expect(m.crossAtMs!).toBeLessThanOrEqual(Math.min(...(m.f2lPairAtMs as number[])));
    }, 60_000);
  }
});

describe("an F2L pair solved early, then knocked out and put back", () => {
  /** A real U-cross solve up to its first pair, a turn that undoes that pair, then the pairs solved again with the knocked-out one last. */
  function reinsertedPairSolve() {
    const solve = fullSolveOn("U");
    const base = run(solve.moves, solve.scramble);
    const times = base.f2lPairAtMs as number[];
    const pair = times.indexOf(Math.min(...times)) as 0 | 1 | 2 | 3;
    const upTo = Math.min(...times) / 100;
    const cube = newCube();
    cube.move([solve.scramble, ...solve.moves.slice(0, upTo)].join(" "));
    expect(f2lPairSolved(cube, pair)).toBe(true);
    const moves = solve.moves.slice(0, upTo);
    const breaker = ["R", "L", "F", "B"].find((f) => {
      const probe = newCube();
      probe.move([solve.scramble, ...moves, f].join(" "));
      return !f2lPairSolved(probe, pair);
    })!;
    cube.move(breaker);
    moves.push(breaker);
    const others = ([0, 1, 2, 3] as const).filter((p) => p !== pair);
    const done: (typeof F2L_PAIRS)[number][] = [];
    for (const q of [...others, pair]) {
      const turns = solvePairFromCube(cube, F2L_PAIRS[q], done)!;
      expect(turns).not.toBeNull();
      cube.move(turns.join(" "));
      moves.push(...turns);
      done.push(F2L_PAIRS[q]);
    }
    return { scramble: solve.scramble, moves, pair, firstSolvedAt: Math.min(...times) };
  }

  it("keeps each pair's FIRST solved time, even when it is knocked out and put back", () => {
    const { scramble, moves, pair, firstSolvedAt } = reinsertedPairSolve();
    const m = run(moves, scramble, { finished: false });
    const times = m.f2lPairAtMs as number[];
    expect(times.every((t) => t !== null)).toBe(true);
    // The F2L case recognition reads each pair's case where the previous pair ended, so a pair's
    // time has to stay where it was first solved; re-timing it at the re-insertion moved it later
    // and collapsed several pairs onto one moment, which broke F2L case detection.
    expect(times[pair]).toBe(firstSolvedAt);
    expect(new Set(times).size).toBe(4);
    // The end of F2L as a whole is still the first moment the bottom layer is solved.
    expect(m.f2lAtMs).toBeGreaterThanOrEqual(Math.max(...times));
  }, 60_000);

  it("does not forget a pair when it is knocked out", () => {
    const { scramble, moves, pair, firstSolvedAt } = reinsertedPairSolve();
    const afterBreak = run(moves.slice(0, firstSolvedAt / 100 + 1), scramble, { finished: false });
    expect(afterBreak.f2lPairAtMs[pair]).toBe(firstSolvedAt);
  }, 60_000);

  it("keeps the table's F2L rows and OLL start in step with the live F2L split", () => {
    const { scramble, moves } = reinsertedPairSolve();
    const m = run(moves, scramble, { finished: false });
    const ollAtMs = m.f2lAtMs! + 700;
    const rows = buildPostSolveRows({
      moves: moves.map((token, i) => ({ token, timeStampMs: (i + 1) * 100 })),
      startedAtMs: 100,
      crossAtMs: m.crossAtMs,
      f2lPairAtMs: m.f2lPairAtMs,
      f2lAtMs: m.f2lAtMs,
      ollAtMs,
      solvedAtMs: ollAtMs + 900,
      ollCaseName: null,
      pllCaseName: null,
    });
    const f2l = rows.filter((r) => r.f2lPairIndex !== null);
    const oll = rows.find((r) => r.label === "OLL")!;
    // F2L ends where the live ribbon says, and OLL starts there.
    expect(f2l[f2l.length - 1].atMs).toBe(m.f2lAtMs);
    expect(oll.startMs).toBe(m.f2lAtMs);
    expect(oll.totalMs).toBe(700);
    expect(f2l.reduce((sum, r) => sum + r.totalMs!, 0)).toBe(m.f2lAtMs! - m.crossAtMs!);
  }, 60_000);
});
