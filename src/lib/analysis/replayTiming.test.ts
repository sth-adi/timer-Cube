import { describe, expect, it } from "vitest";
import {
  IDLE_CAP_MS,
  TURN_MS,
  activeLeaf,
  buildTimeline,
  markSegments,
  phaseMarksFromMilestones,
  phaseMarksFromPhases,
  remapPosition,
} from "./replayTiming";

// 5 moves: quick, a 3s recognition pause, quick, a 700ms pause, quick.
const GAPS = [200, 3000, 200, 700, 160];

describe("buildTimeline", () => {
  it("keeps true gaps with real pauses: each move takes its whole gap", () => {
    const t = buildTimeline(GAPS, { realPauses: true });
    expect(t.durationMs).toBe(GAPS.reduce((a, b) => a + b, 0));
    expect(t.ends.map((e, i) => e - t.starts[i])).toEqual(GAPS.map(() => TURN_MS));
    // each turn ends exactly at that move's real timestamp
    expect(t.ends).toEqual([200, 3200, 3400, 4100, 4260]);
  });

  it("caps idle pauses by default but leaves quick moves alone", () => {
    const t = buildTimeline(GAPS, { realPauses: false });
    // 3000 -> idle 2850 capped to 600; 700 -> idle 550 kept; 200/160 -> small idles kept
    expect(t.starts[1] - t.ends[0]).toBe(IDLE_CAP_MS);
    expect(t.starts[3] - t.ends[2]).toBe(550);
    expect(t.starts[0]).toBe(50);
    expect(t.durationMs).toBe(200 + (TURN_MS + IDLE_CAP_MS) + 200 + 700 + 160);
    expect(t.durationMs).toBeLessThan(buildTimeline(GAPS, { realPauses: true }).durationMs);
  });

  it("is identical in both modes when nothing pauses long", () => {
    const g = [280, 280, 280];
    expect(buildTimeline(g, { realPauses: false })).toEqual(buildTimeline(g, { realPauses: true }));
  });

  it("lasts exactly as long as the solve even when moves come faster than a turn", () => {
    const fast = [90, 110, 100, 120, 95, 105];
    const t = buildTimeline(fast, { realPauses: true });
    expect(t.durationMs).toBe(fast.reduce((a, b) => a + b, 0));
    // a quick move's turn fills its gap, ending at that move's recorded time
    expect(t.ends).toEqual([90, 200, 300, 420, 515, 620]);
  });

  it("never lets a gap shorter than a turn push moves backwards or overlap, and gives back what it borrowed", () => {
    const t = buildTimeline([0, 10, 0, 149, 400], { realPauses: true });
    for (let i = 0; i < t.starts.length; i++) {
      expect(t.ends[i]).toBeGreaterThan(t.starts[i]);
      if (i > 0) expect(t.starts[i]).toBeGreaterThanOrEqual(t.ends[i - 1]);
    }
    // the 400ms gap pays the borrowed time back, so the end is the true 559ms
    expect(t.durationMs).toBe(559);
  });

  it("snaps turns for reduced motion while real pauses still total the true time", () => {
    const t = buildTimeline(GAPS, { realPauses: true, turnMs: 16 });
    expect(t.ends.map((e, i) => e - t.starts[i])).toEqual(GAPS.map(() => 16));
    expect(t.durationMs).toBe(GAPS.reduce((a, b) => a + b, 0));
  });

  it("is empty for no moves", () => {
    expect(buildTimeline([])).toEqual({ starts: [], ends: [], durationMs: 0 });
  });
});

describe("remapPosition", () => {
  const capped = buildTimeline(GAPS, { realPauses: false });
  const real = buildTimeline(GAPS, { realPauses: true });

  it("maps the ends and the start to the ends and the start", () => {
    expect(remapPosition(0, capped, real)).toBe(0);
    expect(remapPosition(capped.durationMs, capped, real)).toBe(real.durationMs);
    expect(remapPosition(real.durationMs, real, capped)).toBe(capped.durationMs);
  });

  it("keeps the same point inside a turn", () => {
    const into = capped.starts[2] + 40;
    expect(remapPosition(into, capped, real)).toBe(real.starts[2] + 40);
  });

  it("keeps the same fraction of a pause: half-way through the long pause stays half-way", () => {
    const mid = (capped.ends[0] + capped.starts[1]) / 2;
    const out = remapPosition(mid, capped, real);
    expect(out).toBe(Math.round((real.ends[0] + real.starts[1]) / 2));
  });

  it("round-trips a turn position and lands on the same move either way", () => {
    for (const pos of [60, 400, 1000, 1400, 1700]) {
      const there = remapPosition(pos, capped, real);
      const back = remapPosition(there, real, capped);
      expect(activeLeaf(real.starts, there)).toBe(activeLeaf(capped.starts, pos));
      expect(Math.abs(back - pos)).toBeLessThanOrEqual(1);
    }
  });

  it("clamps out-of-range positions and copes with empty timelines", () => {
    expect(remapPosition(-50, capped, real)).toBe(0);
    expect(remapPosition(1e9, capped, real)).toBe(real.durationMs);
    const empty = buildTimeline([]);
    expect(remapPosition(100, empty, real)).toBe(0);
    expect(remapPosition(100, capped, empty)).toBe(0);
  });

  it("falls back to proportional when the move counts differ", () => {
    const other = buildTimeline([300, 300]);
    expect(remapPosition(capped.durationMs / 2, capped, other)).toBe(Math.round(other.durationMs / 2));
  });
});

describe("activeLeaf", () => {
  const starts = [100, 400, 700];
  it("is -1 until the first turn has begun", () => {
    expect(activeLeaf(starts, 0)).toBe(-1);
    expect(activeLeaf(starts, 100)).toBe(-1);
    expect(activeLeaf(starts, 101)).toBe(0);
  });
  it("stays on the last move through the pause after it", () => {
    expect(activeLeaf(starts, 399)).toBe(0);
    expect(activeLeaf(starts, 401)).toBe(1);
  });
  it("holds the final move at the end", () => {
    expect(activeLeaf(starts, 99999)).toBe(2);
    expect(activeLeaf([], 50)).toBe(-1);
  });
  it("starts lit from the very first moment when the first move is at 0 only once playback moves", () => {
    expect(activeLeaf([0, 200], 0)).toBe(-1);
    expect(activeLeaf([0, 200], 1)).toBe(0);
  });
});

describe("phase marks", () => {
  // 10 moves, times 100..1000
  const times = Array.from({ length: 10 }, (_, i) => (i + 1) * 100);

  it("splits at the milestones: moves up to each belong to that phase, PLL is the rest", () => {
    const marks = phaseMarksFromMilestones(times, { crossAtMs: 300, f2lAtMs: 650, ollAtMs: 800 });
    expect(marks).toEqual([
      { label: "Cross", moveIndex: 3 },
      { label: "F2L", moveIndex: 6 },
      { label: "OLL", moveIndex: 8 },
      { label: "PLL", moveIndex: 10 },
    ]);
  });

  it("merges a skipped phase into the next and drops unknown milestones", () => {
    // OLL skip: ollAtMs lands on the same move as F2L
    expect(phaseMarksFromMilestones(times, { crossAtMs: 300, f2lAtMs: 700, ollAtMs: 700 }).map((m) => m.label)).toEqual(["Cross", "F2L", "PLL"]);
    expect(phaseMarksFromMilestones(times, { crossAtMs: 300, f2lAtMs: null, ollAtMs: null })).toEqual([
      { label: "Cross", moveIndex: 3 },
      { label: "PLL", moveIndex: 10 },
    ]);
  });

  it("draws nothing when there is only one segment, and extends the last segment to the final move", () => {
    expect(phaseMarksFromMilestones(times, { crossAtMs: null, f2lAtMs: null, ollAtMs: null })).toEqual([]);
    // PLL skip: solve ends exactly at OLL; the last real phase takes the rest
    const marks = phaseMarksFromMilestones(times, { crossAtMs: 300, f2lAtMs: 700, ollAtMs: 1000 });
    expect(marks.map((m) => m.label)).toEqual(["Cross", "F2L", "OLL"]);
    expect(marks[marks.length - 1].moveIndex).toBe(10);
  });

  it("groups analysis phases, treating every F2L pair as one F2L", () => {
    const mv = (n: number) => Array.from({ length: n });
    const marks = phaseMarksFromPhases([
      { phase: "cross", moves: mv(4) },
      { phase: "f2l", moves: mv(3) },
      { phase: "f2l", moves: mv(0) },
      { phase: "f2l", moves: mv(5) },
      { phase: "oll", moves: mv(0) },
      { phase: "pll", moves: mv(6) },
    ]);
    expect(marks).toEqual([
      { label: "Cross", moveIndex: 4 },
      { label: "F2L", moveIndex: 12 },
      { label: "PLL", moveIndex: 18 },
    ]);
  });

  it("places segments on whichever timeline is active, ending where the phase's last turn ends", () => {
    const gaps = [200, 3000, 200, 200];
    const marks = [
      { label: "Cross", moveIndex: 2 },
      { label: "PLL", moveIndex: 4 },
    ];
    const capped = buildTimeline(gaps);
    const real = buildTimeline(gaps, { realPauses: true });
    expect(markSegments(marks, capped)).toEqual([
      { label: "Cross", startMs: 0, endMs: capped.ends[1] },
      { label: "PLL", startMs: capped.ends[1], endMs: capped.durationMs },
    ]);
    const r = markSegments(marks, real);
    expect(r[0].endMs).toBe(3200);
    expect(r[1].endMs).toBe(real.durationMs);
    expect(capped.durationMs).toBeLessThan(real.durationMs);
  });
});
