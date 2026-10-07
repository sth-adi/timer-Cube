import { describe, expect, it } from "vitest";
import { PHASE_HUE_VARS, finishHueVar, lastPhaseIndex } from "./finishMoment";

describe("lastPhaseIndex", () => {
  it("is the last phase with a time", () => {
    expect(lastPhaseIndex([1000, 2000, 3000, 4000])).toBe(3);
    expect(lastPhaseIndex([1000, 2000, null, null])).toBe(1);
    expect(lastPhaseIndex([null, null, null, null])).toBe(-1);
    expect(lastPhaseIndex([])).toBe(-1);
  });
  it("skips a phase the scramble skipped in the middle", () => {
    expect(lastPhaseIndex([1000, null, 3000, null])).toBe(2);
  });
});

describe("finishHueVar", () => {
  it("takes the colour of the phase the solve ended in", () => {
    expect(finishHueVar([1, 2, 3, 4])).toBe("--success");
    expect(finishHueVar([1, 2, 3, null])).toBe("--warning");
    expect(finishHueVar([1, null, null, null])).toBe("--accent");
  });
  it("falls back to the accent with no phases", () => {
    expect(finishHueVar([null, null, null, null])).toBe(PHASE_HUE_VARS[0]);
  });
});
