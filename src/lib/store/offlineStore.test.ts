import { describe, expect, it } from "vitest";
import { skipAutoWarm } from "./offlineStore";

describe("skipAutoWarm", () => {
  it("skips on data-saver or mobile data", () => {
    expect(skipAutoWarm({ saveData: true })).toBe(true);
    expect(skipAutoWarm({ type: "cellular" })).toBe(true);
    expect(skipAutoWarm({ saveData: true, type: "wifi" })).toBe(true);
  });

  it("warms on wifi, unknown or an absent API", () => {
    expect(skipAutoWarm({ type: "wifi" })).toBe(false);
    expect(skipAutoWarm({ saveData: false })).toBe(false);
    expect(skipAutoWarm({})).toBe(false);
    expect(skipAutoWarm(undefined)).toBe(false);
  });
});
