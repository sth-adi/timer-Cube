import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { bigTime, eventCaption, isPersonalBest, lcdReading, moveCounter, moveGridLayout, moveState, phaseAt, stageClockMs, tpsLabel, turnBlurPx } from "./replayStage";

const solve = (id: string, timeMs: number, date: number, extra: Partial<Solve> = {}): Solve => ({ id, sessionId: "s", penalty: "none", scramble: "", timeMs, date, ...extra }) as Solve;

describe("moveGridLayout", () => {
  it("lays a 19-move scramble in three rows of seven, large", () => {
    const g = moveGridLayout(19, 330);
    expect(g.cols).toBe(7);
    expect(g.rows).toBe(3);
    expect(g.fontPx).toBeGreaterThan(18);
  });
  it("never goes below six columns, even for a short list", () => {
    expect(moveGridLayout(4, 330)).toMatchObject({ cols: 6, rows: 1 });
  });
  it("widens for a long solve and only adds rows once the columns run out", () => {
    const mid = moveGridLayout(32, 330);
    expect(mid.cols).toBe(11);
    expect(mid.rows).toBe(3);
    const long = moveGridLayout(90, 330);
    expect(long.cols).toBe(Math.floor(330 / 26));
    expect(long.rows).toBe(Math.ceil(90 / long.cols));
    expect(long.fontPx).toBeGreaterThanOrEqual(10);
  });
  it("holds every move and survives an empty list or a tiny width", () => {
    for (const [n, w] of [[0, 330], [1, 50], [57, 240]] as const) {
      const g = moveGridLayout(n, w);
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
      expect(g.cols).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("moveState", () => {
  it("reads played, current and upcoming around the playing move", () => {
    expect([0, 1, 2, 3].map((i) => moveState(i, 2))).toEqual(["played", "played", "current", "upcoming"]);
  });
  it("has everything upcoming before the first move", () => {
    expect(moveState(0, -1)).toBe("upcoming");
  });
});

describe("phaseAt / moveCounter", () => {
  const marks = [
    { label: "Cross", moveIndex: 6 },
    { label: "F2L", moveIndex: 30 },
    { label: "PLL", moveIndex: 50 },
  ];
  it("names the phase the move falls in, from the first before any move starts", () => {
    expect(phaseAt(marks, -1)).toBe("Cross");
    expect(phaseAt(marks, 5)).toBe("Cross");
    expect(phaseAt(marks, 6)).toBe("F2L");
    expect(phaseAt(marks, 49)).toBe("PLL");
    expect(phaseAt(marks, 500)).toBe("PLL");
  });
  it("is null without marks", () => {
    expect(phaseAt(undefined, 3)).toBeNull();
    expect(phaseAt([], 3)).toBeNull();
  });
  it("pads the count to the total's width and clamps it", () => {
    expect(moveCounter(1, 19)).toBe("01 / 19");
    expect(moveCounter(13, 132)).toBe("013 / 132");
    expect(moveCounter(40, 19)).toBe("19 / 19");
  });
});

describe("clock and LCD", () => {
  it("truncates to hundredths like a stackmat", () => {
    expect(lcdReading(2516)).toEqual({ cells: [null, null, 2, 5, 1], colon: false });
    expect(lcdReading(0).cells).toEqual([null, null, 0, 0, 0]);
    expect(lcdReading(12349).cells).toEqual([null, 1, 2, 3, 4]);
  });
  it("lights the colon from a minute up", () => {
    expect(lcdReading(62510)).toEqual({ cells: [1, 0, 2, 5, 1], colon: true });
    expect(lcdReading(5 * 60000).cells[0]).toBe(5);
  });
  it("prints three decimals big", () => {
    expect(bigTime(2516)).toBe("2.516");
    expect(bigTime(62510)).toBe("1:02.510");
  });
  it("runs on the solve's own clock when it has one, and stops on the final time at the end", () => {
    const starts = [0, 200, 400];
    const moveMs = [1000, 2000, 3000];
    expect(stageClockMs({ positionMs: 200, durationMs: 600, atEnd: false, starts, moveMs, finalMs: 3500 })).toBe(2000);
    expect(stageClockMs({ positionMs: 600, durationMs: 600, atEnd: true, starts, moveMs, finalMs: 3500 })).toBe(3500);
  });
  it("starts at zero, whenever the first move was really made", () => {
    expect(stageClockMs({ positionMs: 0, durationMs: 600, atEnd: false, starts: [0, 200], moveMs: [900, 1500], finalMs: 3000 })).toBe(0);
  });
  it("scales the replay's clock to the final time without move times, and never runs past it", () => {
    expect(stageClockMs({ positionMs: 300, durationMs: 600, atEnd: false, finalMs: 4000 })).toBe(2000);
    expect(stageClockMs({ positionMs: 300, durationMs: 600, atEnd: false })).toBe(300);
    expect(stageClockMs({ positionMs: 9000, durationMs: 600, atEnd: false, starts: [0], moveMs: [100], finalMs: 700 })).toBe(700);
  });
});

describe("end card words", () => {
  it("captions the event, naming a tag", () => {
    expect(eventCaption("3x3")).toBe("3x3 Single");
    expect(eventCaption("3x3", "oh")).toBe("3x3 One-Handed");
    expect(eventCaption("3x3", "nonsense")).toBe("3x3 Single");
  });
  it("calls a solve a personal best only when it beats an earlier one", () => {
    const all = [solve("a", 9000, 1), solve("b", 8000, 2), solve("c", 7000, 10)];
    expect(isPersonalBest(all, { id: "c", timeMs: 7000, date: 10 })).toBe(true);
    expect(isPersonalBest(all, { id: "b", timeMs: 8000, date: 2 })).toBe(true);
    expect(isPersonalBest(all, { id: "a", timeMs: 9000, date: 1 })).toBe(false);
    expect(isPersonalBest(all, { id: "x", timeMs: 7500, date: 20 })).toBe(false);
  });
  it("is not a personal best with nothing earlier, a DNF, or another event", () => {
    expect(isPersonalBest([], { timeMs: 5000 })).toBe(false);
    expect(isPersonalBest([solve("a", 9000, 1)], { timeMs: 5000, penalty: "dnf", date: 5 })).toBe(false);
    expect(isPersonalBest([solve("a", 9000, 1, { event: "oh" })], { timeMs: 5000, date: 5 })).toBe(false);
  });
  it("counts the penalty against a personal best", () => {
    expect(isPersonalBest([solve("a", 6000, 1)], { timeMs: 5000, penalty: "plus2", date: 5 })).toBe(false);
  });
  it("gives turns per second, or nothing for no moves", () => {
    expect(tpsLabel(50, 10000)).toBe("5.0 TPS");
    expect(tpsLabel(0, 10000)).toBeNull();
    expect(tpsLabel(10, 0)).toBeNull();
  });
});

describe("turnBlurPx", () => {
  it("stays between half a pixel and two", () => {
    for (const [ms, speed] of [[150, 1], [150, 4], [16, 1], [800, 0.5], [60, 4]] as const) {
      const px = turnBlurPx(ms, speed);
      expect(px).toBeGreaterThanOrEqual(0.5);
      expect(px).toBeLessThanOrEqual(2);
    }
  });
  it("grows with how fast the turn is", () => {
    expect(turnBlurPx(60, 1)).toBeGreaterThan(turnBlurPx(150, 1));
    expect(turnBlurPx(150, 4)).toBeGreaterThan(turnBlurPx(150, 1));
  });
  it("is zero with no turn or no playback", () => {
    expect(turnBlurPx(0, 1)).toBe(0);
    expect(turnBlurPx(150, 0)).toBe(0);
  });
});
