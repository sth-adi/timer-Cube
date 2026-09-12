import { describe, expect, it, vi } from "vitest";
import { ensureSolverReady, generateScramble333, cubeFromAlg, isSolvedAlg } from "./engine";
import Cube from "./vendor/index.js";

describe("loadPrecomputedSolverTables", () => {
  it("loads every table so initSolver() has nothing left to compute", () => {
    ensureSolverReady();
    for (const name of Object.keys(Cube.moveTables)) {
      expect(Cube.moveTables[name], `moveTables.${name}`).not.toBeNull();
    }
    for (const name of Object.keys(Cube.pruningTables)) {
      expect(Cube.pruningTables[name], `pruningTables.${name}`).not.toBeNull();
    }
  });

  it("generates and solves scrambles round-trip using the precomputed tables", () => {
    ensureSolverReady();
    for (let i = 0; i < 20; i++) {
      const scramble = generateScramble333();
      expect(scramble.trim().split(/\s+/).length).toBeGreaterThan(0);
      const cube = cubeFromAlg(scramble);
      expect(cube.isSolved()).toBe(false);
      const solution = cube.solve(24);
      expect(isSolvedAlg(scramble, solution)).toBe(true);
    }
  });

  it("stays fast on a cold module — a stale generated table would silently fall back to the ~2.5s from-scratch computation", async () => {
    vi.resetModules();
    const fresh = await import("./engine");
    const t0 = performance.now();
    fresh.ensureSolverReady();
    // Generous budget: this same computation measured ~2.5s from scratch on
    // a fast desktop CPU, so 500ms leaves a lot of headroom for CI jitter
    // while still catching a regression to the slow path.
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
