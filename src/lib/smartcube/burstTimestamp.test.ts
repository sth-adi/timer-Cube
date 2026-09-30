import { describe, expect, it } from "vitest";
import { correctBurstTimestamp } from "./burstTimestamp";

describe("correctBurstTimestamp", () => {
  it("trusts the host timestamp for a standalone first move", () => {
    const s = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500 });
    expect(s).toEqual({ timestamp: 1000, cubeTimestamp: 500, correctedTimestamp: 1000 });
  });

  it("trusts the host timestamp when it genuinely advances (no burst)", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1300, cubeTimestamp: 800 });
    expect(s2.correctedTimestamp).toBe(1300);
  });

  it("spreads out moves that share one host timestamp using cubeTimestamp deltas", () => {
    // Three turns land in one BLE notification — same host timestamp, but
    // the cube's own clock shows they were really 40ms and 35ms apart.
    const s1 = correctBurstTimestamp(null, { timestamp: 2000, cubeTimestamp: 1000 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 2000, cubeTimestamp: 1040 });
    const s3 = correctBurstTimestamp(s2, { timestamp: 2000, cubeTimestamp: 1075 });
    expect(s1.correctedTimestamp).toBe(2000);
    expect(s2.correctedTimestamp).toBe(2040);
    expect(s3.correctedTimestamp).toBe(2075);
  });

  it("falls back to the host timestamp when cubeTimestamp is unavailable (GiiKER/GoCube)", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: null });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1000, cubeTimestamp: null });
    expect(s2.correctedTimestamp).toBe(1000);
  });

  it("falls back to the host timestamp when only one side has a cube clock", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1000, cubeTimestamp: 40 });
    expect(s2.correctedTimestamp).toBe(1000);
  });

  it("keeps correcting across a run of repeats, not just the first pair", () => {
    let s: ReturnType<typeof correctBurstTimestamp> | null = null;
    const deltas = [0, 10, 12, 9, 11];
    let cube = 0;
    for (const d of deltas) {
      cube += d;
      s = correctBurstTimestamp(s, { timestamp: 5000, cubeTimestamp: cube });
    }
    expect(s!.correctedTimestamp).toBe(5000 + (10 + 12 + 9 + 11));
  });
});
