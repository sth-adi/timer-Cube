import { describe, expect, it } from "vitest";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CROSS_FACES, relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";
import { NO_MILESTONES, advanceMilestones } from "./milestones";
import { fullSolveOn } from "./testSolves";
import { NO_PROGRESS, advanceProgress, crossHome, pendingStickers, stageOf } from "./cubeProgress";

const SOLVED = newCube().asString();
const after = (alg: string) => {
  const c = newCube();
  c.move(alg);
  return c.asString();
};
const count = (p: boolean[] | null) => (p ? p.filter(Boolean).length : 0);

describe("crossHome", () => {
  it("agrees with the solved cube on every face and breaks with a turn", () => {
    for (const f of CROSS_FACES) {
      expect(crossHome(SOLVED, f)).toBe(true);
      expect(crossHome(after("R"), f)).toBe(f === "L" ? true : false);
    }
  });
});

describe("advanceProgress follows the live milestones exactly", () => {
  for (const face of ["U", "D", "F", "R"] as const) {
    it(`for a ${face}-cross solve, move by move`, () => {
      const solve = fullSolveOn(face);
      const live = newCube();
      live.move(solve.scramble);
      const frames = Object.fromEntries(
        CROSS_FACES.map((f) => {
          const c = newCube();
          c.move(toCrossFrame(solve.scramble.split(" "), f).join(" "));
          return [f, c];
        }),
      ) as Record<CrossFace, CubeJSInstance>;
      let m = NO_MILESTONES;
      let p = NO_PROGRESS;
      solve.moves.forEach((t, i) => {
        live.move(t);
        for (const f of CROSS_FACES) frames[f].move(relabelMove(t, f));
        m = advanceMilestones(m, live, (f) => frames[f], (i + 1) * 100);
        p = advanceProgress(p, live.asString());
        expect(p.crossFace).toBe(m.crossFace);
        expect(p.f2lDone).toBe(m.f2lAtMs !== null);
        expect(p.ollDone).toBe(m.ollAtMs !== null);
      });
      expect(stageOf(p)).toBe("pll");
      expect(pendingStickers(p, live.asString())).toBeNull();
    });
  }
});

const SCRAMBLE = "B2 L2 D' R2 U2 B2 D F2 U' L2 R' B' D2 F U' R F2 L U' B";
const F2L_STAGE = { crossFace: "U", leaning: null, f2lDone: false, ollDone: false } as const;

describe("pendingStickers", () => {
  it("shows nothing before there is anything to track", () => {
    const scrambled = after(SCRAMBLE);
    const p = advanceProgress(NO_PROGRESS, scrambled);
    expect(stageOf(p)).toBe("none");
    expect(pendingStickers(p, scrambled)).toBeNull();
  });

  it("returns the same progress object while nothing changes", () => {
    const p = advanceProgress(NO_PROGRESS, after("R2 L2"));
    expect(advanceProgress(p, after("R2 L2"))).toBe(p);
  });

  it("fills a cross in once two of its edges are home, marking the others", () => {
    // R2 L2 leaves the U, D, F and B crosses with two edges home each; U wins the tie.
    const half = after("R2 L2");
    const q = advanceProgress(NO_PROGRESS, half);
    expect(q.leaning).toBe("U");
    expect(stageOf(q)).toBe("cross");
    // Two edges (four stickers) are out.
    expect(count(pendingStickers(q, half))).toBe(4);
  });

  it("keeps leaning on a face until another has strictly more edges home", () => {
    const q = advanceProgress(NO_PROGRESS, after("R2 L2"));
    // F2 B2 disturbs the F and B edges only: U keeps two edges, D keeps two, no face beats U.
    expect(advanceProgress(q, after("R2 L2 F2 B2")).leaning).toBe("U");
    // Back to solved: the cross completes and the lean is dropped.
    const done = advanceProgress(q, SOLVED);
    expect(done.crossFace).toBe("U");
    expect(done.leaning).toBeNull();
  });

  it("in F2L marks cross edges and unfinished slots only, and a slot counts as one", () => {
    const state = after("R D R' D'");
    const pending = pendingStickers(F2L_STAGE, state)!;
    expect(pending).not.toBeNull();
    // First layer only: nothing on the D face, whose pieces are the last layer's.
    expect(pending.slice(27, 36).filter(Boolean).length).toBe(0);
    // A slot is corner + edge together: both pieces of every touched slot are marked, so corner stickers come with their edge's.
    const marked = pending.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    expect(marked.length).toBeGreaterThanOrEqual(5);
    expect(pendingStickers(F2L_STAGE, SOLVED)).toBeNull();
    // A solved first layer with the last layer scrambled marks nothing in the F2L stage.
    expect(pendingStickers(F2L_STAGE, after("R D R' D R D2 R'"))).toBeNull();
  });

  it("in OLL marks last-layer pieces facing the wrong way, in PLL those out of place", () => {
    const oll = { ...F2L_STAGE, f2lDone: true };
    // Sune from the D side: the U layer stays solved, the D layer is left unoriented.
    const sune = after("R D R' D R D2 R'");
    const o = pendingStickers(oll, sune)!;
    expect(count(o)).toBeGreaterThan(0);
    const pll = { ...oll, ollDone: true };
    // A T-perm on the D side leaves that layer oriented but permuted.
    const tperm = after("R D R' D' R' B R2 D' R' D' R D R' B'");
    expect(pendingStickers(oll, tperm)).toBeNull();
    expect(count(pendingStickers(pll, tperm))).toBeGreaterThan(0);
    expect(pendingStickers(pll, SOLVED)).toBeNull();
  });
});
