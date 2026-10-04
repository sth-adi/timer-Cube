import { describe, expect, it } from "vitest";
import { scrambleWindow } from "@/components/smartcube/scrambleWindow";

const STEPS = ["R", "U'", "F2", "L", "D'"];

describe("scrambleWindow", () => {
  it("starts on the first turn with the next two as preview", () => {
    const w = scrambleWindow(STEPS, 0);
    expect(w.now).toEqual({ index: 0, token: "R" });
    expect(w.next).toEqual([
      { index: 1, token: "U'" },
      { index: 2, token: "F2" },
    ]);
    expect(w).toMatchObject({ done: 0, total: 5, progress: 0, label: "0 / 5", complete: false });
  });

  it("advances now, next and progress together, keeping double and prime tokens intact", () => {
    const w = scrambleWindow(STEPS, 2);
    expect(w.now).toEqual({ index: 2, token: "F2" });
    expect(w.next.map((s) => s.token)).toEqual(["L", "D'"]);
    expect(w.label).toBe("2 / 5");
    expect(w.valueText).toBe("2 of 5 turns done");
    expect(w.progress).toBeCloseTo(0.4);
  });

  it("shortens the preview near the end", () => {
    expect(scrambleWindow(STEPS, 3).next).toEqual([{ index: 4, token: "D'" }]);
    expect(scrambleWindow(STEPS, 4).next).toEqual([]);
  });

  it("is complete with no now chip once every turn is done", () => {
    const w = scrambleWindow(STEPS, 5);
    expect(w).toMatchObject({ now: null, next: [], complete: true, progress: 1, label: "5 / 5" });
  });

  it("treats an empty scramble as complete without dividing by zero", () => {
    const w = scrambleWindow([], 0);
    expect(w).toMatchObject({ now: null, next: [], complete: true, progress: 1, total: 0, label: "0 / 0" });
  });

  it("clamps an out-of-range or invalid index", () => {
    expect(scrambleWindow(STEPS, -3).done).toBe(0);
    expect(scrambleWindow(STEPS, 99)).toMatchObject({ done: 5, complete: true });
    expect(scrambleWindow(STEPS, Number.NaN).done).toBe(0);
  });

  it("honours a custom preview length", () => {
    expect(scrambleWindow(STEPS, 0, 1).next).toHaveLength(1);
    expect(scrambleWindow(STEPS, 0, 0).next).toEqual([]);
  });
});
