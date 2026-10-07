import { describe, expect, it } from "vitest";
import { layoutPacing, pacingIndexAt, pacingSegments, playheadX } from "./pacing";

const phases = [
  { label: "Cross", endMs: 2000, splitMs: 2000 },
  { label: "F2L 1", endMs: 3000, splitMs: 1000 },
  { label: "F2L 2", endMs: 4500, splitMs: 1500 },
  { label: "F2L 3", endMs: 6000, splitMs: 1500 },
  { label: "F2L 4", endMs: 8000, splitMs: 2000 },
  { label: "OLL · Sune", endMs: 9000, splitMs: 1000 },
  { label: "PLL · T Perm", endMs: 10000, splitMs: 1000 },
];

describe("pacing bar", () => {
  it("folds the four F2L pairs into one stretch with a tick per pair, and keeps the cases", () => {
    const segs = pacingSegments(phases, 10000);
    expect(segs.map((s) => s.label)).toEqual(["Cross", "F2L", "OLL", "PLL"]);
    expect(segs.map((s) => s.hue)).toEqual([0, 1, 2, 3]);
    expect(segs[1]).toMatchObject({ startMs: 2000, endMs: 8000, ticks: [3000, 4500, 6000] });
    expect(segs[2].detail).toBe("Sune");
    expect(segs[3].detail).toBe("T Perm");
    expect(segs[0].startMs).toBe(0);
    expect(segs[3].endMs).toBe(10000);
  });

  it("covers the whole solve even with no phases, or with time left after the last one", () => {
    expect(pacingSegments([], 5000)).toMatchObject([{ label: "Solve", startMs: 0, endMs: 5000 }]);
    const segs = pacingSegments(phases.slice(0, 2), 9000);
    expect(segs[segs.length - 1]).toMatchObject({ label: "Finish", startMs: 3000, endMs: 9000 });
  });

  it("lays stretches out to fill the width, none narrower than the floor", () => {
    const segs = pacingSegments(phases, 10000);
    const slots = layoutPacing(segs, 936, 8, 120);
    const last = slots[slots.length - 1];
    expect(last.x + last.w).toBeCloseTo(936, 6);
    for (const s of slots) expect(s.w).toBeGreaterThanOrEqual(120);
    expect(slots[1].w).toBeGreaterThan(slots[0].w);
  });

  it("moves the playhead monotonically from the left edge to the right edge", () => {
    const segs = pacingSegments(phases, 10000);
    const slots = layoutPacing(segs, 936, 8, 120);
    expect(playheadX(segs, slots, 0)).toBe(0);
    expect(playheadX(segs, slots, 10000)).toBeCloseTo(936, 6);
    let prev = -1;
    for (let t = 0; t <= 10000; t += 250) {
      const x = playheadX(segs, slots, t);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
    expect(pacingIndexAt(segs, 2500)).toBe(1);
    expect(pacingIndexAt(segs, 99999)).toBe(3);
  });
});
