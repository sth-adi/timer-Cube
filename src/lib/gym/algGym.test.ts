import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { GYM_CASES, caseKey, explainMiss, pickNextCase, recordAttempt, setupSequence, stepDone } from "./algGym";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("Alg Gym", () => {
  it("sets up every case so that the book alg (with the right AUF) completes it", () => {
    const rand = rng(3);
    for (const c of GYM_CASES) {
      const cube = new Cube();
      cube.move(setupSequence(c, rand));
      expect(stepDone(c.group, cube), c.name).toBe(false);
      const alg = toPhysicalTurns(c.alg, HOME_ORIENTATION).turns;
      const works = ["", "D", "D2", "D'"].some((pre) => {
        const x = cube.clone();
        x.move([pre, ...alg].filter(Boolean).join(" "));
        return stepDone(c.group, x);
      });
      expect(works, c.name).toBe(true);
    }
  });

  it("names the algorithm you did instead", () => {
    const sune = GYM_CASES.find((c) => c.name === "Sune")!;
    const antisune = toPhysicalTurns("R U2 R' U' R U' R'", HOME_ORIENTATION).turns;
    expect(explainMiss(sune, antisune)).toBe("That was the Antisune algorithm — this case is Sune.");
    expect(explainMiss(sune, ["R", "U", "R'", "U'"])).toMatch(/broke F2L/);
  });

  it("keeps rolling stats", () => {
    let s = recordAttempt(undefined, true, 1200, 500);
    s = recordAttempt(s, false, 0, 800);
    s = recordAttempt(s, true, 900, 400);
    expect(s).toMatchObject({ attempts: 3, successes: 2, bestMs: 900, recentMs: [1200, 900], recentRecogMs: [500, 800, 400] });
  });

  it("drills weak cases more and never repeats the last one", () => {
    const pool = GYM_CASES.filter((c) => c.group === "PLL").slice(0, 3);
    const stats = {
      [caseKey(pool[0])]: { attempts: 10, successes: 10, bestMs: 900, recentMs: [1000], recentRecogMs: [300] },
      [caseKey(pool[1])]: { attempts: 10, successes: 4, bestMs: 2500, recentMs: [3000], recentRecogMs: [900] },
      [caseKey(pool[2])]: { attempts: 10, successes: 10, bestMs: 950, recentMs: [1000], recentRecogMs: [300] },
    };
    const rand = rng(7);
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const c = pickNextCase(pool, stats, caseKey(pool[2]), rand);
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    }
    expect(counts.get(pool[2].name)).toBeUndefined();
    expect(counts.get(pool[1].name)!).toBeGreaterThan(counts.get(pool[0].name)! * 3);
  });
});
