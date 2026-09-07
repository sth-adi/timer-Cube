import { describe, expect, it } from "vitest";
import { buildSessionExport, parseSessionExport } from "./sessionExport";
import type { Solve } from "@/types";

function solve(over: Partial<Solve> = {}): Solve {
  return {
    id: "id1",
    sessionId: "s1",
    timeMs: 12340,
    penalty: "none",
    scramble: "R U R' U'",
    date: 1000,
    ...over,
  };
}

describe("sessionExport round-trip", () => {
  it("round-trips a session export through parseSessionExport", () => {
    const exported = buildSessionExport("Session 1", [solve(), solve({ penalty: "plus2", comment: "nice" })]);
    const parsed = parseSessionExport(exported);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].timeMs).toBe(12340);
    expect(parsed[1].penalty).toBe("plus2");
    expect(parsed[1].comment).toBe("nice");
  });

  it("rejects non-object input", () => {
    expect(() => parseSessionExport(null)).toThrow();
    expect(() => parseSessionExport("nope")).toThrow();
  });

  it("rejects input missing a solves array", () => {
    expect(() => parseSessionExport({ version: 1 })).toThrow();
  });

  it("falls back to safe defaults for malformed solve entries", () => {
    const parsed = parseSessionExport({ solves: [{ timeMs: 5000, penalty: "bogus" }] });
    expect(parsed[0].penalty).toBe("none");
    expect(parsed[0].scramble).toBe("");
  });

  it("throws for a solve with no usable time", () => {
    expect(() => parseSessionExport({ solves: [{ scramble: "R U" }] })).toThrow();
  });
});
