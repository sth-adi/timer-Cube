import { describe, expect, it } from "vitest";
import { bestDelta } from "./RecapHero";

describe("bestDelta", () => {
  it("says a new best in words and sign, not just colour", () => {
    expect(bestDelta(9_000, 9_500)).toEqual({ text: "▼ New session best · −0.50s", tone: "best" });
  });
  it("shows how far off the session best a slower solve was", () => {
    expect(bestDelta(10_250, 9_500)).toEqual({ text: "▲ +0.75s vs session best", tone: "off" });
  });
  it("handles a tie, a first solve and a DNF", () => {
    expect(bestDelta(9_500, 9_500).tone).toBe("best");
    expect(bestDelta(9_500, null).tone).toBe("neutral");
    expect(bestDelta(null, 9_500).text).toMatch(/DNF/);
  });
});
