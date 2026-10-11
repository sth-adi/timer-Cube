import { describe, expect, it } from "vitest";
import { ReplayClock } from "./replayClock";
import { DIP_RATE, NO_DIRECTION, directorAt, planMoments } from "./replayDirector";
import { highlightAt, newlyHome, planHighlights, HIGHLIGHT_MS } from "./replayHighlight";

const starts = [0, 200, 900, 1400, 2500, 2700, 4500];
const ends = starts.map((s) => s + 150);
const marks = [
  { label: "Cross", moveIndex: 2 },
  { label: "F2L", moveIndex: 4 },
  { label: "OLL", moveIndex: 6 },
  { label: "PLL", moveIndex: 7 },
];

describe("planMoments", () => {
  it("finds cross done, last pair, OLL / PLL starts and a big pause", () => {
    const m = planMoments({ marks, starts, ends });
    const kinds = m.map((x) => x.kind);
    expect(kinds).toContain("cross");
    expect(kinds).toContain("f2l");
    expect(m.find((x) => x.kind === "cross")?.atMs).toBe(ends[1]);
    expect(m.find((x) => x.kind === "oll")?.atMs).toBe(starts[4]);
    // the long gap before move 6 is a moment (here also the PLL start)
    expect(m.some((x) => x.atMs === 4500)).toBe(true);
    expect(m.map((x) => x.atMs)).toEqual([...m.map((x) => x.atMs)].sort((a, b) => a - b));
  });
  it("is empty with nothing to go on", () => {
    expect(planMoments({ starts: [], ends: [] })).toEqual([]);
  });
});

describe("directorAt", () => {
  const m = planMoments({ marks, starts, ends });
  it("is neutral away from a moment", () => {
    expect(directorAt(m, 9000)).toBe(NO_DIRECTION);
  });
  it("nudges and dips at a moment, deterministically", () => {
    const at = m[0].atMs;
    const f = directorAt(m, at);
    expect(f.rate).toBeCloseTo(DIP_RATE, 5);
    expect(Math.abs(f.yaw)).toBeGreaterThan(0);
    expect(directorAt(m, at)).toEqual(f);
    expect(directorAt(m, at - 500).yaw).toBeCloseTo(0, 5);
  });
});

describe("ReplayClock rateMul", () => {
  it("scales elapsed time consistently across a change", () => {
    let t = 0;
    const c = new ReplayClock(() => t);
    c.setDuration(10000);
    c.play();
    t = 1000;
    c.rateMul = 0.5;
    t = 1400;
    expect(c.now()).toBeCloseTo(1200, 5);
    c.rateMul = 1;
    t = 1500;
    expect(c.now()).toBeCloseTo(1300, 5);
  });
});

describe("highlights", () => {
  const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
  const off = "UUUUUUUUFRRRRRRRRRFFFFFFFFUDDDDDDDDDLLLLLLLLLBBBBBBBBB";
  it("lists stickers that came home", () => {
    expect(newlyHome(off, solved).sort((a, b) => a - b)).toEqual([8, 26]);
    expect(newlyHome(solved, solved)).toEqual([]);
  });
  it("glows for 600 ms after a phase lands, easing out", () => {
    const ev = planHighlights({ marks: [{ label: "PLL", moveIndex: 1 }], ends: [100], faceletsAfter: [off, solved] });
    expect(ev).toHaveLength(1);
    expect(highlightAt(ev, 99)).toBeNull();
    expect(highlightAt(ev, 100)?.strength).toBe(1);
    const mid = highlightAt(ev, 100 + HIGHLIGHT_MS / 2)?.strength ?? 0;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(highlightAt(ev, 100 + HIGHLIGHT_MS)).toBeNull();
  });
});
