import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureSolverReady, generateScramble333, cubeFromAlg, isSolvedAlg } from "./engine";
import Cube from "./vendor/index.js";
import { SOLVER_TABLES_URL } from "./data/solverTablesManifest.generated";

// The real code fetches SOLVER_TABLES_URL as a root-relative path, which
// only resolves against an actual page origin (a browser, or a Worker
// spawned from one) — plain Node has no such base, so `fetch()` there
// would always fail and this suite would only ever exercise the (still
// correct, but much slower) from-scratch fallback path. Stubbing `fetch`
// to serve the same bytes straight from disk lets these tests exercise the
// real fast path, the same way a browser actually would.
beforeAll(() => {
  const binPath = join(__dirname, "..", "..", "..", "public", SOLVER_TABLES_URL.replace(/^\//, ""));
  const bytes = readFileSync(binPath);
  vi.stubGlobal("fetch", async (url: string | URL) => {
    if (String(url) === SOLVER_TABLES_URL) {
      return new Response(bytes);
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("loadPrecomputedSolverTables", () => {
  it("loads every table so initSolver() has nothing left to compute", async () => {
    await ensureSolverReady();
    for (const name of Object.keys(Cube.moveTables)) {
      expect(Cube.moveTables[name], `moveTables.${name}`).not.toBeNull();
    }
    for (const name of Object.keys(Cube.pruningTables)) {
      expect(Cube.pruningTables[name], `pruningTables.${name}`).not.toBeNull();
    }
  });

  it("generates and solves scrambles round-trip using the precomputed tables", async () => {
    await ensureSolverReady();
    for (let i = 0; i < 20; i++) {
      const scramble = generateScramble333();
      expect(scramble.trim().split(/\s+/).length).toBeGreaterThan(0);
      const cube = cubeFromAlg(scramble);
      expect(cube.isSolved()).toBe(false);
      const solution = cube.solve(24);
      expect(isSolvedAlg(scramble, solution)).toBe(true);
    }
  });

  it("stays fast on a cold module — a stale/missing asset would silently fall back to the ~2.5s from-scratch computation", async () => {
    vi.resetModules();
    const fresh = await import("./engine");
    const t0 = performance.now();
    await fresh.ensureSolverReady();
    // Generous budget: this same computation measured ~2.5s from scratch on
    // a fast desktop CPU, so 500ms leaves a lot of headroom for CI jitter
    // while still catching a regression to the slow path.
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
