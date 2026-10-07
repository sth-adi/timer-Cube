import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAPTICS_LEVEL,
  HAPTIC_PATTERNS,
  createTickLimiter,
  levelAllows,
  parseHapticsPref,
  patternDurationMs,
  serializeHapticsPref,
  solveHapticFor,
  type SolveProgress,
} from "./hapticsModel";

const base: SolveProgress = {
  recording: true,
  startedAtMs: 1000,
  solvedAtMs: null,
  crossAtMs: null,
  f2lAtMs: null,
  ollAtMs: null,
  f2lPairAtMs: [null, null, null, null],
};

describe("preference parsing", () => {
  it("defaults to light", () => {
    expect(DEFAULT_HAPTICS_LEVEL).toBe("light");
    expect(parseHapticsPref(null)).toBe("light");
    expect(parseHapticsPref("")).toBe("light");
  });
  it("round-trips every level", () => {
    for (const l of ["off", "light", "full"] as const) expect(parseHapticsPref(serializeHapticsPref(l))).toBe(l);
  });
  it("rejects corrupt or unknown values", () => {
    expect(parseHapticsPref("{nope")).toBe("light");
    expect(parseHapticsPref('{"level":"loud"}')).toBe("light");
    expect(parseHapticsPref('{"level":3}')).toBe("light");
    expect(parseHapticsPref('"full"')).toBe("light");
    expect(parseHapticsPref({ level: "off" })).toBe("off");
  });
});

describe("levels", () => {
  it("off blocks everything, light everything but the turn tick, full all", () => {
    expect(levelAllows("off", "finish")).toBe(false);
    expect(levelAllows("off", "ready")).toBe(false);
    expect(levelAllows("light", "turn")).toBe(false);
    for (const k of ["pair", "phase", "finish", "pb", "pbAverage", "achievement", "ready"] as const) expect(levelAllows("light", k)).toBe(true);
    expect(levelAllows("full", "turn")).toBe(true);
  });
  it("keeps the existing toast patterns and a finish longer than a phase", () => {
    expect(HAPTIC_PATTERNS.pb).toEqual([40, 60, 80]);
    expect(patternDurationMs(HAPTIC_PATTERNS.finish)).toBeGreaterThan(patternDurationMs(HAPTIC_PATTERNS.phase));
    expect(patternDurationMs(HAPTIC_PATTERNS.turn)).toBe(8);
  });
});

describe("tick limiter", () => {
  it("lets one tick through per gap", () => {
    const l = createTickLimiter(60);
    const times = Array.from({ length: 30 }, (_, i) => i * 10); // a 100 TPS flood
    const allowed = times.filter((t) => l.allow(t));
    expect(allowed).toEqual([0, 60, 120, 180, 240]);
  });
  it("lets a 10 TPS solve through at full rate", () => {
    const l = createTickLimiter(60);
    expect([0, 100, 200, 300].every((t) => l.allow(t))).toBe(true);
  });
  it("holds ticks back while a pattern plays, and reset clears it", () => {
    const l = createTickLimiter(60);
    l.hold(500);
    expect(l.allow(100)).toBe(false);
    expect(l.allow(499)).toBe(false);
    expect(l.allow(500)).toBe(true);
    l.hold(2000);
    l.reset();
    expect(l.allow(600)).toBe(true);
  });
  it("a shorter hold never shortens a longer one", () => {
    const l = createTickLimiter(60);
    l.hold(500);
    l.hold(200);
    expect(l.allow(300)).toBe(false);
  });
});

describe("solveHapticFor", () => {
  it("is silent for identical or unrelated changes", () => {
    expect(solveHapticFor(base, base)).toBeNull();
    expect(solveHapticFor(base, { ...base })).toBeNull();
  });
  it("buzzes on the cross, F2L and OLL, but not twice", () => {
    const crossed = { ...base, crossAtMs: 2000 };
    expect(solveHapticFor(base, crossed)).toBe("phase");
    expect(solveHapticFor(crossed, { ...crossed })).toBeNull();
    expect(solveHapticFor(crossed, { ...crossed, f2lAtMs: 5000 })).toBe("phase");
    expect(solveHapticFor(crossed, { ...crossed, ollAtMs: 6000 })).toBe("phase");
  });
  it("gives a single F2L pair its own lighter kind", () => {
    expect(solveHapticFor(base, { ...base, f2lPairAtMs: [3000, null, null, null] })).toBe("pair");
    const one = { ...base, f2lPairAtMs: [3000, null, null, null] };
    expect(solveHapticFor(one, { ...one, f2lPairAtMs: [3000, null, 4000, null] })).toBe("pair");
    // a phase outranks a pair on the same turn
    expect(solveHapticFor(base, { ...base, crossAtMs: 2000, f2lPairAtMs: [2000, null, null, null] })).toBe("phase");
  });
  it("finish outranks a milestone landing on the last turn", () => {
    expect(solveHapticFor(base, { ...base, recording: false, solvedAtMs: 9000, ollAtMs: 9000 })).toBe("finish");
  });
  it("stays silent for a repaired solve adopted after the fact and for resets", () => {
    const idle = { ...base, recording: false, solvedAtMs: 9000 };
    expect(solveHapticFor(idle, { ...idle, crossAtMs: 2000, ollAtMs: 8000 })).toBeNull();
    expect(solveHapticFor({ ...base, crossAtMs: 2000 }, { ...base, startedAtMs: null, crossAtMs: null, recording: false })).toBeNull();
    // not recording either side: a fresh solved state does not count as a finish
    expect(solveHapticFor({ ...base, recording: false }, { ...base, recording: false, solvedAtMs: 5 })).toBeNull();
  });
  it("buzzes on the first turn's own milestone (a cross already solved)", () => {
    const armed = { ...base, recording: false, startedAtMs: null };
    expect(solveHapticFor(armed, { ...base, crossAtMs: 1000 })).toBe("phase");
  });
});
