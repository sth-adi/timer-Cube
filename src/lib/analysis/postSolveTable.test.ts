import { describe, expect, it } from "vitest";
import { buildPostSolveRows } from "./postSolveTable";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";

function move(token: string, timeStampMs: number): SmartCubeMove {
  return { token, timeStampMs };
}

describe("buildPostSolveRows", () => {
  it("returns all four CFOP phases, in order", () => {
    const rows = buildPostSolveRows({
      moves: [],
      startedAtMs: null,
      crossAtMs: null,
      f2lAtMs: null,
      ollAtMs: null,
      solvedAtMs: null,
      ollCaseName: null,
      pllCaseName: null,
    });
    expect(rows.map((r) => r.label)).toEqual(["Cross", "F2L", "OLL", "PLL"]);
    expect(rows.every((r) => r.totalMs === null)).toBe(true);
  });

  it("gives Cross zero recognition — its start boundary already is its own first move", () => {
    // Cross runs from t=0 (startedAtMs, also the first move's own timestamp) to t=1000.
    const rows = buildPostSolveRows({
      moves: [move("F", 0), move("R", 400), move("U", 1000)],
      startedAtMs: 0,
      crossAtMs: 1000,
      f2lAtMs: null,
      ollAtMs: null,
      solvedAtMs: null,
      ollCaseName: null,
      pllCaseName: null,
    });
    const cross = rows[0];
    expect(cross.totalMs).toBe(1000);
    expect(cross.recognitionMs).toBe(0);
    expect(cross.executionMs).toBe(1000);
  });

  it("computes a real recognition/execution split for F2L, OLL, and PLL", () => {
    // Cross ends at t=1000 (last cross move). F2L's first move lands at
    // t=1300 -> 300ms recognition, then F2L finishes at t=3000 -> 1700ms execution.
    const rows = buildPostSolveRows({
      moves: [move("F", 0), move("U", 1000), move("R", 1300), move("U'", 3000)],
      startedAtMs: 0,
      crossAtMs: 1000,
      f2lAtMs: 3000,
      ollAtMs: null,
      solvedAtMs: null,
      ollCaseName: null,
      pllCaseName: null,
    });
    const f2l = rows[1];
    expect(f2l.totalMs).toBe(2000);
    expect(f2l.recognitionMs).toBe(300);
    expect(f2l.executionMs).toBe(1700);
  });

  it("attaches the OLL/PLL case name to the right row only", () => {
    const rows = buildPostSolveRows({
      moves: [],
      startedAtMs: 0,
      crossAtMs: 500,
      f2lAtMs: 2000,
      ollAtMs: 3000,
      solvedAtMs: 4000,
      ollCaseName: "Sune",
      pllCaseName: "T-perm",
    });
    expect(rows.find((r) => r.label === "OLL")?.caseName).toBe("Sune");
    expect(rows.find((r) => r.label === "OLL")?.group).toBe("OLL");
    expect(rows.find((r) => r.label === "PLL")?.caseName).toBe("T-perm");
    expect(rows.find((r) => r.label === "Cross")?.caseName).toBeNull();
    expect(rows.find((r) => r.label === "F2L")?.caseName).toBeNull();
  });

  it("shows a skip (equal start/end boundary) as a zero-duration phase with no split", () => {
    // OLL skip: f2lAtMs === ollAtMs (oriented the instant F2L finished).
    const rows = buildPostSolveRows({
      moves: [move("F", 0), move("U", 1000)],
      startedAtMs: 0,
      crossAtMs: 500,
      f2lAtMs: 1000,
      ollAtMs: 1000,
      solvedAtMs: null,
      ollCaseName: "OLL skip",
      pllCaseName: null,
    });
    const oll = rows.find((r) => r.label === "OLL")!;
    expect(oll.totalMs).toBe(0);
    expect(oll.recognitionMs).toBeNull();
    expect(oll.executionMs).toBeNull();
    expect(oll.caseName).toBe("OLL skip");
  });

  it("leaves PLL's numbers null while the solve is still in progress (solvedAtMs not yet known)", () => {
    const rows = buildPostSolveRows({
      moves: [],
      startedAtMs: 0,
      crossAtMs: 500,
      f2lAtMs: 2000,
      ollAtMs: 3000,
      solvedAtMs: null,
      ollCaseName: "Sune",
      pllCaseName: null,
    });
    const pll = rows.find((r) => r.label === "PLL")!;
    expect(pll.totalMs).toBeNull();
    expect(pll.recognitionMs).toBeNull();
    expect(pll.executionMs).toBeNull();
  });
});
