import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { MIN_SOLVES, buildEconomy, economySolves, summarizeEconomy, type EconomySolve } from "./economy";

function makeSolve(id: string, date: number, reconstruction?: string, penalty: Solve["penalty"] = "none"): Solve {
  return { id, sessionId: "s", timeMs: 10_000, penalty, scramble: "R U R' U'", date, reconstruction };
}

describe("economySolves", () => {
  it("counts simplified (same-face-merged) moves, skips DNFs and solves without a reconstruction", () => {
    const solves = [
      makeSolve("a", 3, "R U R' U'"), // 4 distinct-face moves, nothing to merge
      makeSolve("b", 1, "R R' U R U2 R"), // R R' cancels outright, leaving U R U2 R -> 4 moves
      makeSolve("dnf", 2, "R U R' U'", "dnf"),
      makeSolve("untimed", 4, undefined),
    ];
    const rows = economySolves(solves);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]); // sorted by date
    expect(rows.find((r) => r.id === "a")!.moves).toBe(4);
    expect(rows.find((r) => r.id === "b")!.moves).toBe(4);
  });
});

describe("summarizeEconomy", () => {
  const row = (id: string, date: number, moves: number): EconomySolve => ({ id, date, moves });

  it("returns null under MIN_SOLVES", () => {
    const rows = Array.from({ length: MIN_SOLVES - 1 }, (_, i) => row(`${i}`, i, 55));
    expect(summarizeEconomy(rows)).toBeNull();
  });

  it("flags real improvement in move count over practice", () => {
    // A steady downward trend from ~65 to ~48 turns per solve.
    const rows = Array.from({ length: 40 }, (_, i) => row(`${i}`, i, Math.round(65 - i * 0.45)));
    const report = summarizeEconomy(rows)!;
    expect(report).not.toBeNull();
    expect(report.solves).toBe(40);
    expect(report.curve.plateau).toBe(false);
    // Move counts sit well under 100 — a fit that floored them at 100 (as
    // Progress Forecast does for ms) would flatten this to 0% improvement.
    expect(report.curve.per100).toBeGreaterThan(0.05);
    expect(report.headline).toMatch(/trimming about/);
    expect(report.headline).toMatch(/Down from .* turns\/solve early on to .* now\./);
  });

  it("calls a flat move-count series a plateau", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`${i}`, i, 52 + ((i * 7) % 3) - 1)); // hovering around 52, no trend
    const report = summarizeEconomy(rows)!;
    expect(report.curve.plateau).toBe(true);
    expect(report.headline).toMatch(/levelled off/);
  });
});

describe("buildEconomy", () => {
  it("wires economySolves into summarizeEconomy end to end", () => {
    const solves = Array.from({ length: MIN_SOLVES + 5 }, (_, i) => makeSolve(`s${i}`, i, "R U R' U' F' L B D".repeat(1 + Math.floor(i / 10))));
    const report = buildEconomy(solves);
    expect(report).not.toBeNull();
    expect(report!.solves).toBe(MIN_SOLVES + 5);
  });

  it("returns null with too little history", () => {
    expect(buildEconomy([makeSolve("a", 1, "R U R' U'")])).toBeNull();
  });
});
