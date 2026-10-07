import { describe, expect, it } from "vitest";
import { PACE_MIN_SCALE_TPS, PAUSE_MIN_MS, buildPaceCurve, paceAreaPath, paceAt, paceLinePath } from "./paceCurve";
import { buildTimeline } from "./replayTiming";

const even = (n: number, gap: number) => Array.from({ length: n }, () => gap);

describe("buildPaceCurve", () => {
  it("is null for a solve too short to draw", () => {
    const t = buildTimeline(even(4, 200), { realPauses: true });
    expect(buildPaceCurve(t, t)).toBeNull();
  });

  it("reads a steady pace as that many turns per second in the middle", () => {
    const t = buildTimeline(even(60, 200), { realPauses: true });
    const c = buildPaceCurve(t, t)!;
    expect(c.values).toHaveLength(96);
    expect(c.values[48]).toBeGreaterThan(4.5);
    expect(c.values[48]).toBeLessThan(5.5);
    expect(c.pauses).toEqual([]);
    expect(c.peakTps).toBeCloseTo(Math.max(...c.values), 9);
  });

  it("dips at a long pause and marks it, in true timing", () => {
    const gaps = [...even(20, 200), 2500, ...even(20, 200)];
    const real = buildTimeline(gaps, { realPauses: true });
    const c = buildPaceCurve(real, real)!;
    expect(c.pauses).toHaveLength(1);
    expect(c.pauses[0].ms).toBeGreaterThan(2000);
    const mid = (c.pauses[0].startFrac + c.pauses[0].endFrac) / 2;
    expect(paceAt(c, mid).tps).toBeLessThan(paceAt(c, 0.15).tps / 2);
    expect(paceAt(c, mid).pause).not.toBeNull();
    expect(paceAt(c, 0.1).pause).toBeNull();
  });

  it("keeps the dip and the mark where the scrubber is when the replay shortens the pause", () => {
    const gaps = [...even(20, 200), 2500, ...even(20, 200)];
    const real = buildTimeline(gaps, { realPauses: true });
    const capped = buildTimeline(gaps, { realPauses: false });
    const c = buildPaceCurve(real, capped)!;
    expect(capped.durationMs).toBeLessThan(real.durationMs - 1500);
    expect(c.pauses).toHaveLength(1);
    const p = c.pauses[0];
    // On the capped scrubber the pause is about 0.6s of a ~8s replay, not 2.5s of ~10s.
    expect((p.endFrac - p.startFrac) * capped.durationMs).toBeLessThan(800);
    expect(p.ms).toBeGreaterThan(2000);
    const mid = (p.startFrac + p.endFrac) / 2;
    expect(paceAt(c, mid).tps).toBeLessThan(paceAt(c, 0.1).tps / 2);
    expect(p.endFrac).toBeLessThanOrEqual(1);
  });

  it("only marks pauses of PAUSE_MIN_MS or more", () => {
    const gaps = [...even(10, 200), PAUSE_MIN_MS - 100, ...even(10, 200)];
    const t = buildTimeline(gaps, { realPauses: true });
    expect(buildPaceCurve(t, t)!.pauses).toEqual([]);
  });

  it("never scales a slow solve below the minimum height", () => {
    const t = buildTimeline(even(30, 900), { realPauses: true });
    expect(buildPaceCurve(t, t)!.scaleTps).toBe(PACE_MIN_SCALE_TPS);
  });
});

describe("paths", () => {
  it("keep every point inside the box", () => {
    const t = buildTimeline([...even(30, 150), 1800, ...even(30, 150)], { realPauses: true });
    const c = buildPaceCurve(t, t)!;
    const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const d of [paceAreaPath(c, 100, 20), paceLinePath(c, 100, 20)]) {
      const v = nums(d);
      for (let i = 0; i < v.length; i += 2) {
        expect(v[i]).toBeGreaterThanOrEqual(0);
        expect(v[i]).toBeLessThanOrEqual(100);
        expect(v[i + 1]).toBeGreaterThanOrEqual(0);
        expect(v[i + 1]).toBeLessThanOrEqual(20);
      }
    }
  });
});
