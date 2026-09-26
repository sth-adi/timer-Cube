import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { buildWrapped, periodBounds, wrappedSlides } from "./wrapped";

const NOW = new Date(2026, 8, 26, 20).getTime();
let n = 0;
const at = (m: number, d: number, h: number) => new Date(2026, m, d, h).getTime();
const solve = (date: number, timeMs: number, extra: Partial<Solve> = {}): Solve => ({ id: `w${n++}`, sessionId: "s", timeMs, penalty: "none", scramble: "", date, ...extra });

describe("Cube Wrapped", () => {
  it("bounds the month and the one before", () => {
    const b = periodBounds(NOW, "month");
    expect(new Date(b.start).getDate()).toBe(1);
    expect(new Date(b.start).getMonth()).toBe(8);
    expect(new Date(b.prevStart).getMonth()).toBe(7);
  });

  it("needs a few solves in the period", () => {
    expect(buildWrapped([solve(at(8, 2, 10), 10000)], NOW, "month")).toBeNull();
  });

  it("tells the month's story from its solves", () => {
    const prev = Array.from({ length: 12 }, (_, i) => solve(at(7, 10, 10) + i * 60e3, 16000));
    const month = [
      ...[3, 4, 5].flatMap((d) => Array.from({ length: 4 }, (_, i) => solve(at(8, d, 9) + i * 60e3, 13000 + i * 100))), // mornings
      ...[10, 20].flatMap((d) => Array.from({ length: 5 }, (_, i) => solve(at(8, d, 21) + i * 60e3, 15000))), // evenings
    ];
    month.push(solve(at(8, 21, 21), 9000));
    const w = buildWrapped([...prev, ...month], NOW, "month")!;
    expect(w.solves).toBe(23);
    expect(w.days).toBe(6);
    expect(w.longestStreak).toBe(3);
    expect(w.best?.ms).toBe(9000);
    expect(w.pbs).toBe(2); // 13.0 beats 16.0, then 9.0
    expect(w.improvement?.deltaMs).toBeLessThan(0);
    expect(w.improvement?.against).toBe("last month");
    expect(w.sharpest?.slot).toBe("in the morning");
    const slides = wrappedSlides(w);
    expect(slides[0].big).toBe(w.label);
    expect(slides.some((s) => s.kicker === "You got faster")).toBe(true);
    expect(slides[slides.length - 1].kicker).toBe("That's a wrap");
  });
});
