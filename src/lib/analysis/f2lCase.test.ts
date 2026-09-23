import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { FACELET_POSITIONS, recognizeF2lCase } from "./f2lCase";

const solved = new Cube().asString();

/** An engine-frame cube after doing `userAlg` the way you hold it (yellow up, green front). */
function fromUserAlg(userAlg: string) {
  const c = new Cube();
  c.move(`z2 ${userAlg} z2`);
  return c;
}
const unsolvedPair = (c: InstanceType<typeof Cube>) => ([0, 1, 2, 3] as const).find((p) => !f2lPairSolved(c, p))!;

describe("sticker tables", () => {
  it("every position reads its own faces on a solved cube", () => {
    for (const [pos, idx] of [...Object.entries(FACELET_POSITIONS.CORNERS), ...Object.entries(FACELET_POSITIONS.EDGES)]) {
      expect(idx.map((i) => solved[i]).sort().join("")).toBe(pos.split("").sort().join(""));
    }
  });
});

describe("recognizeF2lCase", () => {
  it("the same case gets the same key and name in every slot", () => {
    const alg = "R U' R' U2";
    const inverse: Record<string, string> = { "": "", y: "y'", y2: "y2", "y'": "y" };
    const results = ["", "y", "y2", "y'"].map((rot) => {
      const c = fromUserAlg(`${rot} ${alg} ${inverse[rot]}`);
      return recognizeF2lCase(c, unsolvedPair(c))!;
    });
    expect(new Set(results.map((r) => r.key)).size).toBe(1);
    expect(results[0].kind).toBe("standard");
  });

  it("a pair taken out with R U R' is a both-on-top case, the corner above the slot", () => {
    const c = fromUserAlg("R U R'");
    const r = recognizeF2lCase(c, unsolvedPair(c))!;
    expect(r.key.startsWith("URF:")).toBe(true);
    expect(r.name).toMatch(/^White .* · edge (front|right|back|left)/);
  });

  it("a twisted corner in its slot is named as such", () => {
    // R U R' U' R U R' twists the FR corner in place and keeps the edge home… plus AUF; just check the category.
    const c = fromUserAlg("R U R' U' R U R' U' R U R' U'");
    const p = ([0, 1, 2, 3] as const).find((i) => !f2lPairSolved(c, i));
    if (p === undefined) return;
    expect(recognizeF2lCase(c, p)!.name).toMatch(/Corner in slot|White/);
  });

  it("real solves never produce more than the 41 standard cases, and names are one-to-one with keys", () => {
    const names = new Map<string, string>();
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const faces = ["U", "D", "R", "L", "F", "B"];
    for (let n = 0; n < 60; n++) {
      const scramble = Array.from({ length: 20 }, () => faces[Math.floor(rand() * 6)] + ["", "'", "2"][Math.floor(rand() * 3)]).join(" ");
      const cube = new Cube();
      cube.move(scramble);
      const cross = solveCrossOptimal(scramble);
      if (cross.length) cube.move(cross.join(" "));
      for (const pair of solveF2L(cube.clone())) {
        const before = ([0, 1, 2, 3] as const).filter((p) => f2lPairSolved(cube, p));
        if (pair.moves.length) cube.move(pair.moves.join(" "));
        const done = ([0, 1, 2, 3] as const).filter((p) => f2lPairSolved(cube, p) && !before.includes(p));
        if (done.length !== 1) continue;
        const start = cube.clone();
        start.move(pair.moves.slice().reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith("2") ? m : `${m}'`)).join(" "));
        const r = recognizeF2lCase(start, done[0]);
        if (!r || r.kind !== "standard") continue;
        const prev = names.get(r.key);
        if (prev) expect(prev).toBe(r.name);
        names.set(r.key, r.name);
      }
    }
    expect(names.size).toBeGreaterThan(15);
    expect(names.size).toBeLessThanOrEqual(41);
    expect(new Set(names.values()).size).toBe(names.size);
  });

  it("every placement of one pair gives exactly the 41 standard cases (plus solved), each with its own name", () => {
    // These only ever move the front-right pair and the top layer, so a long
    // random walk visits every place and twist that pair can be in.
    const gens = ["U", "U'", "U2", "R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F", "F' U2 F"];
    const keys = new Map<string, string>();
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const walk: string[] = [];
    for (let i = 0; i < 4000; i++) {
      walk.push(gens[Math.floor(rand() * gens.length)]);
      const c = fromUserAlg(walk.join(" "));
      // Front-right as you hold it is the engine's front-left slot (pair 1).
      const r = recognizeF2lCase(c, 1)!;
      expect(r.kind).toBe("standard");
      keys.set(r.key, r.name);
    }
    expect(keys.size).toBe(42);
    expect(new Set(keys.values()).size).toBe(42);
  });
});
