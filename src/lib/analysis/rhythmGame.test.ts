import { describe, expect, it } from "vitest";
import { buildRhythmTrack, judgeHit, applyHit, initialScoreState, gradeFor, HIT_WINDOW_MS } from "./rhythmGame";

describe("buildRhythmTrack", () => {
  it("returns an empty track for an empty reconstruction", () => {
    expect(buildRhythmTrack("")).toEqual({ notes: [], durationMs: 0, hasRealTiming: false });
  });

  it("builds one note per move, with cumulative hitAtMs from real moveTimestamps", () => {
    const track = buildRhythmTrack("R U R' U'", [200, 500, 900, 1100]);
    expect(track.hasRealTiming).toBe(true);
    expect(track.notes.map((n) => n.token)).toEqual(["R", "U", "R'", "U'"]);
    expect(track.notes.map((n) => n.hitAtMs)).toEqual([200, 500, 900, 1100]);
    expect(track.durationMs).toBe(1100);
  });

  it("falls back to a level cadence when moveTimestamps is absent or mismatched, and flags hasRealTiming false", () => {
    const track = buildRhythmTrack("R U R'");
    expect(track.hasRealTiming).toBe(false);
    expect(track.notes).toHaveLength(3);
    // Level cadence: equal gaps between consecutive notes.
    const gap1 = track.notes[1].hitAtMs - track.notes[0].hitAtMs;
    const gap2 = track.notes[2].hitAtMs - track.notes[1].hitAtMs;
    expect(gap1).toBe(gap2);
  });
});

describe("judgeHit", () => {
  const note = { hitAtMs: 1000 };

  it("is perfect within the perfect window", () => {
    expect(judgeHit(note, 1000)).toBe("perfect");
    expect(judgeHit(note, 1000 + HIT_WINDOW_MS.perfect)).toBe("perfect");
    expect(judgeHit(note, 1000 - HIT_WINDOW_MS.perfect)).toBe("perfect");
  });

  it("is good just outside the perfect window but inside the good window", () => {
    expect(judgeHit(note, 1000 + HIT_WINDOW_MS.perfect + 1)).toBe("good");
    expect(judgeHit(note, 1000 + HIT_WINDOW_MS.good)).toBe("good");
  });

  it("is a miss outside the good window, on either side", () => {
    expect(judgeHit(note, 1000 + HIT_WINDOW_MS.good + 1)).toBe("miss");
    expect(judgeHit(note, 1000 - HIT_WINDOW_MS.good - 1)).toBe("miss");
  });
});

describe("applyHit", () => {
  it("increments combo and score on a perfect, and awards more than a good does", () => {
    const afterPerfect = applyHit(initialScoreState(), "perfect");
    const afterGood = applyHit(initialScoreState(), "good");
    expect(afterPerfect.combo).toBe(1);
    expect(afterPerfect.perfects).toBe(1);
    expect(afterPerfect.score).toBeGreaterThan(afterGood.score);
  });

  it("resets combo to 0 on a miss but keeps score and counts intact", () => {
    let state = initialScoreState();
    state = applyHit(state, "perfect");
    state = applyHit(state, "perfect");
    expect(state.combo).toBe(2);
    state = applyHit(state, "miss");
    expect(state.combo).toBe(0);
    expect(state.misses).toBe(1);
    expect(state.score).toBeGreaterThan(0); // earlier perfects' points aren't erased
  });

  it("tracks maxCombo separately from the current (possibly reset) combo", () => {
    let state = initialScoreState();
    state = applyHit(state, "perfect");
    state = applyHit(state, "perfect");
    state = applyHit(state, "perfect");
    state = applyHit(state, "miss");
    state = applyHit(state, "perfect");
    expect(state.combo).toBe(1);
    expect(state.maxCombo).toBe(3);
  });

  it("gives a longer combo a higher per-hit score than the same judgement with no combo", () => {
    let state = initialScoreState();
    for (let i = 0; i < 10; i++) state = applyHit(state, "perfect");
    const scoreBefore = state.score;
    state = applyHit(state, "perfect");
    const marginalGain = state.score - scoreBefore;

    const freshGain = applyHit(initialScoreState(), "perfect").score;
    expect(marginalGain).toBeGreaterThan(freshGain);
  });
});

describe("gradeFor", () => {
  it("gives D for zero notes", () => {
    expect(gradeFor(initialScoreState(), 0)).toBe("D");
  });

  it("gives S only for a clean run with essentially no misses", () => {
    let state = initialScoreState();
    for (let i = 0; i < 20; i++) state = applyHit(state, "perfect");
    expect(gradeFor(state, 20)).toBe("S");
  });

  it("never gives S if there was even one miss, regardless of accuracy elsewhere", () => {
    let state = initialScoreState();
    for (let i = 0; i < 19; i++) state = applyHit(state, "perfect");
    state = applyHit(state, "miss");
    expect(gradeFor(state, 20)).not.toBe("S");
  });

  it("gives D for a run that mostly missed", () => {
    let state = initialScoreState();
    for (let i = 0; i < 18; i++) state = applyHit(state, "miss");
    for (let i = 0; i < 2; i++) state = applyHit(state, "good");
    expect(gradeFor(state, 20)).toBe("D");
  });
});
