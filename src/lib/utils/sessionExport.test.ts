import { describe, expect, it } from "vitest";
import { buildSessionExport, describeImport, parseSessionExport } from "./sessionExport";
import type { FullSolve } from "@/types";

function solve(over: Partial<FullSolve> = {}): FullSolve {
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

describe("sessionExport is lossless", () => {
  /** A smart-cube solve with every field the app stores. */
  const full: FullSolve = {
    id: "full-1",
    sessionId: "s1",
    timeMs: 9876,
    penalty: "plus2",
    scramble: "R U R' U' F2",
    date: 1_700_000_000_123,
    updatedAt: 1_700_000_050_000,
    comment: "pb attempt",
    splits: [1500, 5200, 8000],
    event: "oh",
    reconstruction: "R U R' U'",
    cube: { id: "cube-1", name: "GAN 12", protocol: "gan", corrected: true },
    repaired: { kind: "inserted", index: 2, tokens: ["R'"] },
    heartRate: { avg: 92, max: 110 },
    crossMs: 1500,
    moveTimestamps: [100, 220, 360, 480],
    rotations: [{ atMs: 50, token: "y" }],
    orientedReconstruction: "y R U R' U'",
    gyroStream: { atMs: [0, 50, 100], qx: [0, 0.1, 0.2], qy: [0, 0, 0.05], qz: [0, -0.1, 0], qw: [1, 0.99, 0.97] },
  };

  it("carries every Solve field but sessionId through export → JSON → import", () => {
    const parsed = parseSessionExport(JSON.parse(JSON.stringify(buildSessionExport("S", [full]))));
    expect(parsed[0]).toEqual({ ...full, sessionId: undefined });
    expect(Object.keys(parsed[0])).not.toContain("sessionId");
  });

  it("drops a malformed gyro stream rather than importing it", () => {
    const bad = { ...full, gyroStream: { atMs: [0, 50], qx: [0], qy: [0, 0], qz: [0, 0], qw: [1, 1] } };
    expect(parseSessionExport(JSON.parse(JSON.stringify(buildSessionExport("S", [bad]))))[0].gyroStream).toBeUndefined();
  });

  it("still reads exports from before ids were written", () => {
    const parsed = parseSessionExport({ version: 1, solves: [{ timeMs: 5000, penalty: "none", scramble: "R", date: 1 }] });
    expect(parsed[0].id).toBeUndefined();
    expect(parsed[0].updatedAt).toBeUndefined();
  });
});

describe("describeImport", () => {
  it("says what was added and what was already here", () => {
    expect(describeImport({ added: 40, updated: 0, skipped: 560 })).toBe("Imported 40 solves, skipped 560 already here.");
    expect(describeImport({ added: 1, updated: 2, skipped: 0 }, "from csTimer")).toBe("Imported 1 solve from csTimer, updated 2.");
  });
});
