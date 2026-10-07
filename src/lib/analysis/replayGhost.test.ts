import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { ghostFrameAt, ghostTimeline, modelGhost, pbGhost, pickGhostSolve } from "./replayGhost";

const solve = (id: string, timeMs: number, over: Partial<Solve> = {}): Solve =>
  ({
    id,
    sessionId: "s",
    timeMs,
    penalty: "none",
    scramble: `R U F${id}`,
    date: 1000,
    reconstruction: "R U R'",
    moveTimestamps: [300, 700, timeMs],
    ...over,
  }) as Solve;

describe("pickGhostSolve", () => {
  const target = { id: "now", scramble: "B D", timeMs: 12000, date: 5000 };

  it("takes the fastest earlier solve with moves and a time for each", () => {
    const solves = [solve("a", 14000), solve("b", 11000), solve("c", 9000, { moveTimestamps: undefined }), solve("d", 9500, { moveTimestamps: [1, 2] })];
    expect(pickGhostSolve(solves, target)?.id).toBe("b");
  });

  it("is null when there is nothing to race", () => {
    expect(pickGhostSolve([], target)).toBeNull();
    expect(pickGhostSolve([solve("a", 9000, { reconstruction: undefined })], target)).toBeNull();
  });

  it("skips the solve itself, DNFs, later solves and other events", () => {
    const solves = [
      solve("now", 8000),
      solve("dnf", 8000, { penalty: "dnf" }),
      solve("later", 8000, { date: 6000 }),
      solve("oh", 8000, { event: "oh" }),
      solve("ok", 13000),
    ];
    expect(pickGhostSolve(solves, target)?.id).toBe("ok");
  });

  it("counts a +2 against a solve", () => {
    expect(pickGhostSolve([solve("p", 8000, { penalty: "plus2" }), solve("q", 11000)], target)?.id).toBe("p");
    expect(pickGhostSolve([solve("p", 9500, { penalty: "plus2" }), solve("q", 11000)], target)?.id).toBe("q");
  });

  it("recognises the solve itself by scramble and time when no id is known", () => {
    const t = { scramble: "R U F1", timeMs: 14000 };
    expect(pickGhostSolve([solve("1", 14000)], t)).toBeNull();
    expect(pickGhostSolve([solve("1", 14000), solve("2", 15000)], t)?.id).toBe("2");
  });

  it("labels a faster ghost PB and a slower one honestly", () => {
    const s = solve("a", 9000);
    expect(pbGhost(s, 12000).label).toBe("PB 9.00");
    expect(pbGhost(s, 8000).label).toBe("Earlier best 9.00");
  });
});

describe("modelGhost", () => {
  it("turns at the user's pace", () => {
    const g = modelGhost("R U", ["U'", "R'"], 4, 2000)!;
    expect(g.timesMs).toEqual([500, 1000]);
    expect(g.totalMs).toBe(1000);
    expect(modelGhost("R U", [], 4, 2000)).toBeNull();
    expect(modelGhost("R U", ["R"], 0, 2000)).toBeNull();
  });
});

describe("ghostFrameAt", () => {
  const g = modelGhost("R U", ["R", "U", "R'"], 3, 3000)!;
  const tl = ghostTimeline(g, 150);

  it("walks from nothing, through a turn, to finished", () => {
    expect(ghostFrameAt(tl, 0)).toEqual({ done: 0, turning: null, finished: false });
    const mid = ghostFrameAt(tl, (tl.starts[1] + tl.ends[1]) / 2);
    expect(mid.done).toBe(1);
    expect(mid.turning?.index).toBe(1);
    expect(mid.turning?.progress).toBeCloseTo(0.5, 5);
    const between = ghostFrameAt(tl, tl.ends[1] + 10);
    expect(between).toEqual({ done: 2, turning: null, finished: false });
    expect(ghostFrameAt(tl, tl.durationMs + 500)).toEqual({ done: 3, turning: null, finished: true });
  });

  it("ends exactly when the ghost's solve did", () => {
    expect(tl.durationMs).toBe(g.totalMs);
  });
});
