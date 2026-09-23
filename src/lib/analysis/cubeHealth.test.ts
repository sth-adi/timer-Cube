import { describe, expect, it } from "vitest";
import { buildCubeHealthReport, type HealthSolve } from "./cubeHealth";

interface Opts {
  /** Mid-flurry gap before each face's turns. */
  gapFor?: Partial<Record<string, number>>;
  /** Insert a U-U' catch every N moves. */
  catchEvery?: number;
}

/** A synthetic 60-turn solve cycling through all six faces with no same-face repeats. */
function fakeSolve(date: number, opts: Opts = {}): HealthSolve {
  const cycle = ["R", "U", "F", "D", "L", "B", "R'", "U'", "F'", "D'", "L'", "B'"];
  const tokens: string[] = [];
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < 60; i++) {
    const token = cycle[i % cycle.length];
    t += opts.gapFor?.[token[0]] ?? 150;
    tokens.push(token);
    times.push(t);
    if (opts.catchEvery && i % opts.catchEvery === 0 && token[0] === "U") {
      tokens.push(token.endsWith("'") ? "U" : "U'");
      t += 90;
      times.push(t);
    }
  }
  return { date, reconstruction: tokens.join(" "), moveTimestamps: times };
}

describe("buildCubeHealthReport", () => {
  it("needs at least 3 smart-cube solves", () => {
    expect(buildCubeHealthReport([fakeSolve(1), fakeSolve(2)])).toBeNull();
  });

  it("rates an even cube healthy across the board", () => {
    const report = buildCubeHealthReport(Array.from({ length: 10 }, (_, i) => fakeSolve(i)))!;
    expect(report.faces.every((f) => f.status === "healthy")).toBe(true);
    expect(report.overallScore).toBe(100);
    expect(report.headline).toMatch(/great shape/);
    expect(report.peakTps).toBeCloseTo(1000 / 150, 1);
  });

  it("flags a dragging face as too tight", () => {
    const report = buildCubeHealthReport(Array.from({ length: 10 }, (_, i) => fakeSolve(i, { gapFor: { R: 230 } })))!;
    const red = report.faces.find((f) => f.face === "R")!;
    expect(red.relativeDrag).toBeGreaterThan(1.4);
    expect(red.status).toBe("attention");
    expect(red.advice).toMatch(/too tight/);
    expect(report.headline).toBe("Your red face needs attention first.");
  });

  it("flags a face that keeps overshooting as too loose", () => {
    const report = buildCubeHealthReport(Array.from({ length: 10 }, (_, i) => fakeSolve(i, { catchEvery: 1 })))!;
    const white = report.faces.find((f) => f.face === "U")!;
    expect(white.catchesPer100).toBeGreaterThan(20);
    expect(white.advice).toMatch(/too loose/);
    // Catches are corrections, not drag — they don't make the face look slow.
    expect(white.relativeDrag).toBeCloseTo(1, 1);
  });

  it("detects wear: a face slowing relative to the rest over time", () => {
    const solves = Array.from({ length: 12 }, (_, i) => fakeSolve(i, i >= 6 ? { gapFor: { L: 185 } } : {}));
    const orange = buildCubeHealthReport(solves)!.faces.find((f) => f.face === "L")!;
    expect(orange.wearTrend).toBeGreaterThan(0.15);
  });

  it("doesn't mistake getting faster overall for wear", () => {
    const solves = Array.from({ length: 12 }, (_, i) =>
      fakeSolve(i, i >= 6 ? { gapFor: { U: 110, R: 110, F: 110, D: 110, L: 110, B: 110 } } : {}),
    );
    const report = buildCubeHealthReport(solves)!;
    expect(report.faces.every((f) => Math.abs(f.wearTrend ?? 0) < 0.01)).toBe(true);
  });

  it("skips solves without per-move timing", () => {
    const solves = [...Array.from({ length: 3 }, (_, i) => fakeSolve(i)), { date: 9, reconstruction: "R U", moveTimestamps: [] }];
    expect(buildCubeHealthReport(solves)!.solvesAnalyzed).toBe(3);
  });
});
