import { describe, expect, it } from "vitest";
import { looksLikeCsTimerExport, parseCsTimerExport } from "./csTimerImport";

describe("looksLikeCsTimerExport", () => {
  it("recognizes the session-key shape", () => {
    expect(looksLikeCsTimerExport({ session1: [[[0, 12345], "R U", ""]] })).toBe(true);
  });

  it("rejects this app's own export format", () => {
    expect(looksLikeCsTimerExport({ version: 1, solves: [] })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(looksLikeCsTimerExport(null)).toBe(false);
    expect(looksLikeCsTimerExport("session1")).toBe(false);
    expect(looksLikeCsTimerExport([1, 2, 3])).toBe(false);
  });
});

describe("parseCsTimerExport", () => {
  it("parses a typical export with penalties, a DNF, and named sessions", () => {
    const raw = {
      session1: [
        [[0, 12345], "R U R' U'", ""],
        [[2000, 9800], "F2 L2", "sloppy"],
        [[-1, 20000], "B D'", ""],
      ],
      properties: { sessionData: JSON.stringify({ session1: { name: "Daily practice" } }) },
    };
    const parsed = parseCsTimerExport(raw);
    expect(parsed.sessions).toEqual([{ key: "session1", name: "Daily practice", count: 3 }]);

    const rows = parsed.solvesByKey.session1;
    expect(rows[0]).toMatchObject({ timeMs: 12345, penalty: "none", scramble: "R U R' U'" });
    expect(rows[1]).toMatchObject({ timeMs: 9800, penalty: "plus2", comment: "sloppy" });
    expect(rows[2]).toMatchObject({ timeMs: 20000, penalty: "dnf" });
  });

  it("treats both -1 and -2 penalty codes as DNF", () => {
    const raw = { session1: [[[-1, 1000], "R", ""], [[-2, 1000], "U", ""]] };
    const rows = parseCsTimerExport(raw).solvesByKey.session1;
    expect(rows.every((r) => r.penalty === "dnf")).toBe(true);
  });

  it("converts a Unix-seconds timestamp to milliseconds", () => {
    const raw = { session1: [[[0, 1000], "R", "", 1_700_000_000]] };
    const rows = parseCsTimerExport(raw).solvesByKey.session1;
    expect(rows[0].date).toBe(1_700_000_000_000);
  });

  it("falls back to the raw session key when no name metadata exists", () => {
    const raw = { session1: [[[0, 1000], "R", ""]] };
    expect(parseCsTimerExport(raw).sessions[0].name).toBe("session1");
  });

  it("collects multiple sessions independently", () => {
    const raw = {
      session1: [[[0, 1000], "R", ""]],
      session2: [[[0, 2000], "U", ""], [[0, 3000], "F", ""]],
    };
    const parsed = parseCsTimerExport(raw);
    expect(parsed.sessions.map((s) => [s.key, s.count])).toEqual([
      ["session1", 1],
      ["session2", 2],
    ]);
  });

  it("skips malformed entries rather than failing the whole import", () => {
    const raw = { session1: [[[0, 1000], "R", ""], "not a solve", [123], [[0, 2000], "U", ""]] };
    expect(parseCsTimerExport(raw).solvesByKey.session1).toHaveLength(2);
  });

  it("throws with a readable message when nothing parses", () => {
    expect(() => parseCsTimerExport({ properties: {} })).toThrow(/no solves/i);
    expect(() => parseCsTimerExport(null)).toThrow();
  });
});
