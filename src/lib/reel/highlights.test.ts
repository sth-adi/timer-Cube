import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { CARD_MS, OPENER_MS, SEG_INTRO_MS, buildMontage, montageAt, montageSoundtrack, pickHighlights } from "./highlights";

const DAY = 864e5;
const NOW = 100 * DAY;

/** A filmable solve: scramble R U, solved by U' R' at real timestamps. */
function solve(id: string, timeMs: number, daysAgo: number, extra: Partial<Solve> = {}): Solve {
  return {
    id,
    sessionId: "s",
    timeMs,
    penalty: "none",
    scramble: "R U",
    date: NOW - daysAgo * DAY,
    reconstruction: "U' R'",
    moveTimestamps: [timeMs / 2, timeMs],
    ...extra,
  };
}

describe("pickHighlights", () => {
  it("only takes filmable solves in the period, and builds to the fastest", () => {
    const solves = [solve("a", 12000, 1), solve("b", 9000, 2), solve("c", 11000, 3), solve("old", 5000, 20), solve("plain", 8000, 1, { reconstruction: undefined })];
    const picked = pickHighlights(solves, { now: NOW, period: "week" });
    const ids = picked.map((h) => h.solve.id);
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("plain");
    expect(ids[ids.length - 1]).toBe("b");
    // Slowest first.
    for (let i = 1; i < picked.length; i++) expect(picked[i].finalMs).toBeLessThanOrEqual(picked[i - 1].finalMs);
  });

  it("calls a solve a PB only if it beat everything before it, filmable or not", () => {
    // An unfilmable 8s from before the week means the 9s this week is no PB.
    const solves = [solve("plain", 8000, 10, { reconstruction: undefined }), solve("b", 9000, 2), solve("c", 7000, 1)];
    const picked = pickHighlights(solves, { now: NOW, period: "week" });
    expect(picked.find((h) => h.solve.id === "c")?.kind).toBe("pb");
    expect(picked.find((h) => h.solve.id === "b")?.kind).not.toBe("pb");
  });

  it("skips DNFs, respects max, and never repeats a solve", () => {
    const solves = Array.from({ length: 12 }, (_, i) => solve(`s${i}`, 10000 + i * 100, 1));
    solves.push(solve("dnf", 1000, 1, { penalty: "dnf" }));
    const picked = pickHighlights(solves, { now: NOW, period: "week", max: 4 });
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((h) => h.solve.id)).size).toBe(4);
    expect(picked.map((h) => h.solve.id)).not.toContain("dnf");
  });
});

describe("montage", () => {
  const m = buildMontage(pickHighlights([solve("a", 4000, 1), solve("b", 3000, 1)], { now: NOW, period: "week" }));

  it("lays segments end to end after the opener", () => {
    expect(m.segments[0].startMs).toBe(OPENER_MS);
    expect(m.segments[1].startMs).toBe(m.segments[0].endMs);
    expect(m.finaleStartMs).toBe(m.segments[1].endMs);
    expect(m.segments[0].timeline.facelets[m.segments[0].timeline.facelets.length - 1]).toBe(
      "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
    );
  });

  it("maps montage time to the right moment", () => {
    expect(montageAt(m, 10).kind).toBe("opener");
    expect(montageAt(m, OPENER_MS + 10)).toEqual({ kind: "card", index: 0, t: 10 });
    const seg = m.segments[0];
    expect(montageAt(m, seg.solveStartMs + 500)).toEqual({ kind: "solve", index: 0, t: 500 });
    expect(montageAt(m, seg.startMs + CARD_MS + 1)).toEqual({ kind: "solve", index: 0, t: 1 - SEG_INTRO_MS });
    expect(montageAt(m, m.finaleStartMs + 5)).toEqual({ kind: "finale", t: 5 });
  });

  it("puts a soundtrack note on every turn, at the moment it happened", () => {
    const cues = montageSoundtrack(m);
    const turns = cues.filter((c) => c.kind === "turn");
    expect(turns).toHaveLength(4);
    expect(turns[0].atMs).toBe(m.segments[0].solveStartMs + 2000);
    expect(cues.filter((c) => c.kind === "card")).toHaveLength(3);
  });
});
