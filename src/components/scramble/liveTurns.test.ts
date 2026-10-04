import { describe, expect, it } from "vitest";
import { MIN_ANIMATION_GAP_MS, isAppendOnly, planLiveUpdate, tempoScaleFor } from "./liveTurns";

const ctx = { nowMs: 1000, lastAnimMs: -Infinity, reducedMotion: false };
const snap = (tokens: string[], setup = "R U") => ({ setup, tokens });

describe("isAppendOnly", () => {
  it("accepts equal and extended lists", () => {
    expect(isAppendOnly([], [])).toBe(true);
    expect(isAppendOnly(["R"], ["R", "U"])).toBe(true);
    expect(isAppendOnly(["R", "U"], ["R", "U"])).toBe(true);
  });
  it("rejects shorter lists and rewritten history", () => {
    expect(isAppendOnly(["R", "U"], ["R"])).toBe(false);
    expect(isAppendOnly(["R", "U"], ["R", "U'", "F"])).toBe(false);
    expect(isAppendOnly(["R", "U"], ["U", "R", "U"])).toBe(false);
  });
});

describe("planLiveUpdate", () => {
  it("snaps on first show", () => {
    expect(planLiveUpdate(null, snap([]), ctx)).toEqual({ kind: "snap" });
  });

  it("does nothing when nothing changed", () => {
    expect(planLiveUpdate(snap(["R"]), snap(["R"]), ctx)).toEqual({ kind: "none" });
  });

  it("animates a single appended turn", () => {
    expect(planLiveUpdate(snap(["R"]), snap(["R", "U"]), ctx)).toEqual({ kind: "append", added: ["U"], animate: true });
  });

  it("hands over every added token when several land at once (the caller animates only the last)", () => {
    expect(planLiveUpdate(snap(["R"]), snap(["R", "U", "F'"]), ctx)).toEqual({ kind: "append", added: ["U", "F'"], animate: true });
  });

  it("falls back to a full rebuild on reset, correction, rewind and a new scramble", () => {
    expect(planLiveUpdate(snap(["R", "U"]), snap([]), ctx).kind).toBe("snap");
    expect(planLiveUpdate(snap(["R", "U"]), snap(["R", "U'"]), ctx).kind).toBe("snap");
    expect(planLiveUpdate(snap(["R", "U"]), snap(["R"]), ctx).kind).toBe("snap");
    expect(planLiveUpdate(snap(["R", "U"]), snap(["R", "U", "F"], "D2"), ctx).kind).toBe("snap");
  });

  it("applies without animation under reduced motion", () => {
    expect(planLiveUpdate(snap([]), snap(["R"]), { ...ctx, reducedMotion: true })).toEqual({ kind: "append", added: ["R"], animate: false });
  });

  it("snaps (no animation) when turns arrive faster than an animation can play", () => {
    const fast = { ...ctx, nowMs: 1000, lastAnimMs: 1000 - (MIN_ANIMATION_GAP_MS - 1) };
    expect(planLiveUpdate(snap(["R"]), snap(["R", "U"]), fast)).toEqual({ kind: "append", added: ["U"], animate: false });
    const ok = { ...ctx, nowMs: 1000, lastAnimMs: 1000 - MIN_ANIMATION_GAP_MS };
    expect(planLiveUpdate(snap(["R"]), snap(["R", "U"]), ok)).toEqual({ kind: "append", added: ["U"], animate: true });
  });
});

describe("tempoScaleFor", () => {
  it("maps a target quarter-turn time onto cubing.js's 1s default", () => {
    expect(tempoScaleFor(80)).toBeCloseTo(12.5);
    expect(tempoScaleFor(1000)).toBe(1);
  });
  it("never goes absurdly fast", () => {
    expect(tempoScaleFor(0)).toBe(50);
  });
});
