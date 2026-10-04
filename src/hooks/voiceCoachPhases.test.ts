import { describe, expect, it } from "vitest";
import { advancePhaseTracker, createPhaseTracker, type PhaseTrackerInput } from "./voiceCoachPhases";

const idle: PhaseTrackerInput = {
  recording: false,
  finished: false,
  startedAtMs: null,
  crossAtMs: null,
  f2lAtMs: null,
  ollAtMs: null,
};
const running = (over: Partial<PhaseTrackerInput> = {}): PhaseTrackerInput => ({ ...idle, recording: true, startedAtMs: 1000, ...over });
const done = (over: Partial<PhaseTrackerInput> = {}): PhaseTrackerInput => ({ ...running(over), recording: false, finished: true });
const phases = (r: { calls: { phase: number }[] }) => r.calls.map((c) => c.phase);

function fresh() {
  return createPhaseTracker({ recording: false, startedAtMs: null });
}

describe("phase calls while recording", () => {
  it("speaks each milestone once, in order, with its own duration", () => {
    const t = fresh();
    expect(advancePhaseTracker(t, running(), true).calls).toEqual([]);
    expect(advancePhaseTracker(t, running({ crossAtMs: 3000 }), true).calls).toEqual([{ phase: 0, durationMs: 2000 }]);
    expect(advancePhaseTracker(t, running({ crossAtMs: 3000 }), true).calls).toEqual([]);
    const r = advancePhaseTracker(t, running({ crossAtMs: 3000, f2lAtMs: 9000, ollAtMs: 12000 }), true);
    expect(r.calls).toEqual([
      { phase: 1, durationMs: 6000 },
      { phase: 2, durationMs: 3000 },
    ]);
  });

  it("measures a phase from the last milestone that was reached", () => {
    const t = fresh();
    const r = advancePhaseTracker(t, running({ f2lAtMs: 6000 }), true);
    expect(r.calls).toEqual([{ phase: 1, durationMs: 5000 }]);
  });
});

describe("a milestone on the last move", () => {
  it("speaks OLL when the solve finishes in the same update (PLL skip)", () => {
    const t = fresh();
    advancePhaseTracker(t, running({ crossAtMs: 2000, f2lAtMs: 8000 }), true);
    const r = advancePhaseTracker(t, done({ crossAtMs: 2000, f2lAtMs: 8000, ollAtMs: 11000 }), true);
    expect(r.calls).toEqual([{ phase: 2, durationMs: 3000 }]);
  });

  it("speaks every missed milestone, in order, when a one-update solve never showed recording", () => {
    const t = fresh();
    const r = advancePhaseTracker(t, done({ crossAtMs: 2000, f2lAtMs: 8000, ollAtMs: 11000 }), true);
    expect(phases(r)).toEqual([0, 1, 2]);
    expect(r.newAttempt).toBe(true);
  });

  it("does not announce something it already announced", () => {
    const t = fresh();
    const all = { crossAtMs: 2000, f2lAtMs: 8000, ollAtMs: 11000 };
    expect(phases(advancePhaseTracker(t, running(all), true))).toEqual([0, 1, 2]);
    expect(advancePhaseTracker(t, done(all), true).calls).toEqual([]);
  });

  it("stays quiet afterwards, even if a repair later fills in a milestone", () => {
    const t = fresh();
    advancePhaseTracker(t, done({ crossAtMs: 2000 }), true);
    expect(advancePhaseTracker(t, done({ crossAtMs: 2000, f2lAtMs: 5000 }), true).calls).toEqual([]);
  });

  it("doesn't speak a solve that was already finished when the hook mounted", () => {
    const t = createPhaseTracker({ recording: false, startedAtMs: 1000 });
    expect(advancePhaseTracker(t, done({ crossAtMs: 2000, f2lAtMs: 5000, ollAtMs: 8000 }), true).calls).toEqual([]);
  });

  it("speaks the next solve normally after one that finished", () => {
    const t = fresh();
    advancePhaseTracker(t, done({ crossAtMs: 2000 }), true);
    const r = advancePhaseTracker(t, running({ startedAtMs: 50000, crossAtMs: 52000 }), true);
    expect(r.newAttempt).toBe(true);
    expect(r.calls).toEqual([{ phase: 0, durationMs: 2000 }]);
  });
});

describe("aborting", () => {
  it("says nothing once the attempt is cleared", () => {
    const t = fresh();
    advancePhaseTracker(t, running({ crossAtMs: 3000 }), true);
    expect(advancePhaseTracker(t, idle, true).calls).toEqual([]);
    expect(advancePhaseTracker(t, idle, true).calls).toEqual([]);
  });

  it("says nothing for a milestone that lands in the update that stops recording unfinished", () => {
    const t = fresh();
    advancePhaseTracker(t, running(), true);
    const r = advancePhaseTracker(t, { ...running({ crossAtMs: 3000 }), recording: false }, true);
    expect(r.calls).toEqual([]);
  });

  it("doesn't replay the splits if the stopped solve is then marked solved by hand", () => {
    const t = fresh();
    advancePhaseTracker(t, running({ crossAtMs: 3000 }), true);
    advancePhaseTracker(t, { ...running({ crossAtMs: 3000 }), recording: false }, true);
    expect(advancePhaseTracker(t, done({ crossAtMs: 3000 }), true).calls).toEqual([]);
  });

  it("doesn't carry what was spoken into the next attempt", () => {
    const t = fresh();
    advancePhaseTracker(t, running({ crossAtMs: 3000 }), true);
    advancePhaseTracker(t, idle, true);
    const r = advancePhaseTracker(t, running({ startedAtMs: 9000, crossAtMs: 10000 }), true);
    expect(r.calls).toEqual([{ phase: 0, durationMs: 1000 }]);
  });
});

describe("voice off", () => {
  it("consumes nothing while running, so switching on mid-solve catches up", () => {
    const t = fresh();
    expect(advancePhaseTracker(t, running({ crossAtMs: 3000 }), false).calls).toEqual([]);
    expect(phases(advancePhaseTracker(t, running({ crossAtMs: 3000 }), true))).toEqual([0]);
  });

  it("doesn't speak a finished solve when switched on afterwards", () => {
    const t = fresh();
    advancePhaseTracker(t, running(), false);
    advancePhaseTracker(t, done({ crossAtMs: 3000 }), false);
    expect(advancePhaseTracker(t, done({ crossAtMs: 3000 }), true).calls).toEqual([]);
  });

  it("still notices a new attempt", () => {
    const t = fresh();
    expect(advancePhaseTracker(t, running(), false).newAttempt).toBe(true);
  });
});

describe("reconnecting mid-solve", () => {
  it("keeps what was already called when the same attempt resumes recording", () => {
    const t = fresh();
    advancePhaseTracker(t, running({ crossAtMs: 3000 }), true);
    advancePhaseTracker(t, { ...running({ crossAtMs: 3000 }), recording: false }, true);
    const r = advancePhaseTracker(t, running({ crossAtMs: 3000, f2lAtMs: 7000 }), true);
    expect(r.newAttempt).toBe(false);
    expect(r.calls).toEqual([{ phase: 1, durationMs: 4000 }]);
  });
});
