import { describe, expect, it } from "vitest";
import { averageOfN } from "./stats";
import { pbTargets, slowestToBeat } from "./targets";

const ao = (xs: number[]) => averageOfN(xs).value ?? Infinity;

describe("slowestToBeat", () => {
  it("returns the exact tipping point for an ao5", () => {
    const prev = [10000, 11000, 9000, 12000];
    const target = 10500;
    const need = slowestToBeat(prev, 5, target);
    expect(typeof need).toBe("number");
    const n = need as number;
    expect(ao([...prev, n])).toBeLessThan(target); // that time sets the record…
    expect(ao([...prev, n + 1])).toBeGreaterThanOrEqual(target); // …one ms slower doesn't
  });

  it("is exact across many random windows, for ao5 and ao12", () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const n of [5, 12]) {
      for (let trial = 0; trial < 40; trial++) {
        const prev = Array.from({ length: n - 1 }, () => Math.round(8000 + rand() * 8000));
        const target = Math.round(9000 + rand() * 6000);
        const need = slowestToBeat(prev, n, target);
        if (need === null) {
          expect(ao([...prev, 0])).toBeGreaterThanOrEqual(target);
        } else if (need === "any") {
          expect(ao([...prev, 999_999])).toBeLessThan(target);
        } else {
          expect(ao([...prev, need])).toBeLessThan(target);
          expect(ao([...prev, need + 1])).toBeGreaterThanOrEqual(target);
        }
      }
    }
  });

  it("says impossible when even an instant solve wouldn't do it", () => {
    expect(slowestToBeat([20000, 21000, 22000, 23000], 5, 9000)).toBeNull();
  });

  it("knows a DNF in the window makes it harder, and two make it impossible", () => {
    const oneDnf = slowestToBeat([10000, Infinity, 10000, 10000], 5, 12000);
    expect(typeof oneDnf === "number" || oneDnf === "any").toBe(true);
    expect(slowestToBeat([Infinity, Infinity, 10000, 10000], 5, 12000)).toBeNull();
  });

  it("refuses a window of the wrong size", () => {
    expect(slowestToBeat([1, 2, 3], 5, 10)).toBeNull();
  });
});

describe("pbTargets", () => {
  it("has a single target from the first solve, and averages only once there are enough", () => {
    expect(pbTargets([])).toEqual({ single: null, averages: [] });
    expect(pbTargets([12000, 11000])).toEqual({ single: 11000, averages: [] });
    const five = pbTargets([12000, 11000, 13000, 10000, 12500]);
    expect(five.single).toBe(10000);
    expect(five.averages.map((a) => a.n)).toEqual([5]);
    expect(pbTargets(Array.from({ length: 12 }, (_, i) => 10000 + i * 100)).averages.map((a) => a.n)).toEqual([5, 12]);
  });

  it("measures the best average across every window, not just the latest", () => {
    // A great run early, then slower: best ao5 is the early one, current is worse.
    const times = [9000, 9100, 9200, 9000, 9100, 14000, 15000, 14500, 15500, 14800];
    const a = pbTargets(times).averages[0];
    expect(a.best).toBeCloseTo(ao([9000, 9100, 9200, 9000, 9100]), 5);
    expect(a.current).toBeCloseTo(ao([14000, 15000, 14500, 15500, 14800]), 5);
    expect(a.need).toBeNull(); // nowhere near it with four slow solves behind you
  });

  it("the threshold it reports really does set a record", () => {
    const times = [10500, 10200, 9800, 10900, 10100, 10400, 10300];
    const a = pbTargets(times).averages[0];
    if (typeof a.need === "number") {
      expect(ao([...times.slice(-4), a.need])).toBeLessThan(a.best);
    }
  });

  it("ignores DNFs for the best single and never treats a DNF average as a best", () => {
    const t = pbTargets([Infinity, 11000, 12000, 10000, Infinity]);
    expect(t.single).toBe(10000);
    expect(t.averages).toEqual([]); // the only window has two DNFs
  });
});
