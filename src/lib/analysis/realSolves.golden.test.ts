import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { solveBreakdown } from "./solveBreakdown";
import { f2lCaseStats, solveF2lTurns } from "./f2lCaseStats";
import raw from "./__fixtures__/realSmartSolves.json";

/**
 * Golden data: fourteen recorded smart-cube solves run through the whole
 * recap pipeline (milestones, the per-phase table, F2L case recognition and
 * turn counts). The snapshot is the answer these solves have always had, so a
 * change to detection that moves any F2L row, case name or split shows up here
 * rather than in a user's recap. If a change is intended, review the snapshot
 * diff by eye before updating it.
 */
const solves: Solve[] = raw.map((s, i) => ({
  id: `real-${i}`,
  sessionId: "golden",
  timeMs: s.timeMs,
  penalty: "none",
  scramble: s.scramble,
  date: s.date,
  reconstruction: s.reconstruction,
  moveTimestamps: s.moveTimestamps,
}));

const ms = (n: number | null) => (n === null ? "-" : String(n));

describe("recorded smart-cube solves", () => {
  it("has every solve breaking down", () => {
    for (const s of solves) expect(solveBreakdown(s), s.id).not.toBeNull();
  });

  it("keeps every phase row", () => {
    const lines = solves.map((s) => {
      const b = solveBreakdown(s)!;
      const rows = b.rows.map(
        (r) =>
          `${r.label}${r.f2lPairIndex === null ? "" : `#${r.f2lPairIndex}`}[${ms(r.startMs)}-${ms(r.atMs)}|${ms(r.recognitionMs)}/${ms(r.executionMs)}]${r.caseName ? ` ${r.caseName}` : ""}`,
      );
      return `${s.id} cross=${b.crossFace}\n  ${rows.join("\n  ")}`;
    });
    expect(lines.join("\n")).toMatchSnapshot();
  });

  it("keeps each solve's F2L cases and turn counts", () => {
    const lines = solves.map((s) => `${s.id}: ${solveF2lTurns(s).map((t) => `${t.key}=${t.turns}`).join(", ")}`);
    expect(lines.join("\n")).toMatchSnapshot();
  });

  it("keeps the aggregate F2L case stats", () => {
    const stats = [...f2lCaseStats(solves)]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${key} n=${v.count} mean=${v.meanTurns.toFixed(2)} best=${v.bestTurns}`);
    expect(stats.join("\n")).toMatchSnapshot();
  });
});
