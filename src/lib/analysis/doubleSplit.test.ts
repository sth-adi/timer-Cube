import { describe, expect, it } from "vitest";
import { gapsToTimes, isFaceDouble, splitDoubles } from "./doubleSplit";

describe("splitDoubles", () => {
  it("uses a recorded first quarter", () => {
    expect(splitDoubles(["R", "U2"], [500, 1000], [null, 880])).toEqual([null, 880]);
  });
  it("estimates about 90ms before the move after a long pause", () => {
    expect(splitDoubles(["R", "U2"], [500, 1500])).toEqual([null, 1410]);
  });
  it("estimates the first move's gap from 0", () => {
    expect(splitDoubles(["U2"], [1000])).toEqual([910]);
  });
  it("keeps the in-double gap under 45% of a short gap, and over 30ms", () => {
    // gap 120: 45% is 54ms
    expect(splitDoubles(["R", "U2"], [1000, 1120])[1]).toBeCloseTo(1120 - 54, 6);
    // gap 50: 22.5ms would be below the 30ms floor
    expect(splitDoubles(["R", "U2"], [1000, 1050])[1]).toBe(1020);
  });
  it("gives null when there is no room for two turns", () => {
    expect(splitDoubles(["R", "U2"], [1000, 1020])[1]).toBeNull();
  });
  it("ignores a recorded half outside the move's gap", () => {
    expect(splitDoubles(["R", "U2"], [500, 1500], [null, 400])[1]).toBe(1410);
    expect(splitDoubles(["R", "U2"], [500, 1500], [null, 1500])[1]).toBe(1410);
  });
  it("leaves non-doubles alone", () => {
    expect(splitDoubles(["M2", "x", "R", "R'", "Rw2", "y2"], [100, 300, 500, 700, 900, 1100])).toEqual([null, null, null, null, null, null]);
    expect(isFaceDouble("F2")).toBe(true);
    expect(isFaceDouble("M2")).toBe(false);
  });
  it("turns gaps back into times", () => {
    expect(gapsToTimes([100, 50, 0])).toEqual([100, 150, 150]);
  });
});
