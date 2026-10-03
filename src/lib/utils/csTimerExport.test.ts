import { describe, expect, it } from "vitest";
import { buildCsTimerExport } from "./csTimerExport";
import { looksLikeCsTimerExport, parseCsTimerExport } from "./csTimerImport";

const solves = [
  { timeMs: 12345, penalty: "none" as const, scramble: "R U R' U'", date: 1_700_000_005_678 },
  { timeMs: 9800, penalty: "plus2" as const, scramble: "F2 L2", date: 1_700_000_100_999, comment: "sloppy, \"quoted\"" },
  { timeMs: 20000, penalty: "dnf" as const, scramble: "B D'", date: 1_700_000_200_000, comment: "" },
];

describe("buildCsTimerExport", () => {
  it("round-trips times, penalties, scrambles, comments and dates (to the second) through the importer", () => {
    const file = JSON.parse(JSON.stringify(buildCsTimerExport([{ name: "Daily", solves }])));
    expect(looksLikeCsTimerExport(file)).toBe(true);

    const parsed = parseCsTimerExport(file);
    expect(parsed.sessions).toEqual([{ key: "session1", name: "Daily", count: 3 }]);
    const rows = parsed.solvesByKey.session1;
    expect(rows).toHaveLength(3);
    solves.forEach((s, i) => {
      expect(rows[i].timeMs).toBe(s.timeMs);
      expect(rows[i].penalty).toBe(s.penalty);
      expect(rows[i].scramble).toBe(s.scramble);
      expect(rows[i].comment).toBe(s.comment || undefined);
      expect(rows[i].date).toBe(Math.floor(s.date / 1000) * 1000);
    });
  });

  it("writes csTimer's own penalty codes and second-resolution timestamps", () => {
    const file = buildCsTimerExport([{ name: "S", solves }]) as { session1: unknown[] };
    expect(file.session1[0]).toEqual([[0, 12345], "R U R' U'", "", 1_700_000_005]);
    expect(file.session1[1]).toEqual([[2000, 9800], "F2 L2", "sloppy, \"quoted\"", 1_700_000_100]);
    expect(file.session1[2]).toEqual([[-1, 20000], "B D'", "", 1_700_000_200]);
  });

  it("exports several sessions, in date order, keeping their names", () => {
    const file = JSON.parse(
      JSON.stringify(
        buildCsTimerExport([
          { name: "One", solves: [solves[1], solves[0]] },
          { name: "Two", solves: [solves[2]] },
        ]),
      ),
    );
    const parsed = parseCsTimerExport(file);
    expect(parsed.sessions.map((s) => [s.key, s.name, s.count])).toEqual([
      ["session1", "One", 2],
      ["session2", "Two", 1],
    ]);
    expect(parsed.solvesByKey.session1.map((r) => r.timeMs)).toEqual([12345, 9800]);
  });
});
