import { describe, expect, it } from "vitest";
import { INSPECTION_DNF_MS, INSPECTION_MS, TimerMachine, inspectionPenalty } from "./timerMachine";
import { keyAction } from "./timerInput";

const HOLD = 300;
const make = (o: Partial<{ inspectionEnabled: boolean; holdToStartMs: number; phaseCount: number }> = {}) =>
  new TimerMachine({ inspectionEnabled: false, holdToStartMs: HOLD, phaseCount: 1, ...o });

describe("inspectionPenalty — WCA A3a boundaries", () => {
  it.each([
    [0, "none"],
    [14_999, "none"],
    [INSPECTION_MS, "none"], // exactly 15.000s is still on time
    [INSPECTION_MS + 1, "plus2"],
    [16_500, "plus2"],
    [INSPECTION_DNF_MS, "plus2"], // exactly 17.000s is still +2
    [INSPECTION_DNF_MS + 1, "dnf"],
    [60_000, "dnf"],
  ] as const)("starting %ims into inspection → %s", (ms, penalty) => {
    expect(inspectionPenalty(ms)).toBe(penalty);
  });
});

/** Press to begin inspection at t=0, then a fresh hold starting at `startAt` − HOLD, released at `startAt`; stop 10s later. */
function solveStartingAt(startAt: number) {
  const m = make({ inspectionEnabled: true });
  m.press(0); // inspection begins
  m.release(50); // let go straight away — inspection keeps running
  m.press(startAt - HOLD); // arms immediately (second press during inspection)
  expect(m.phase).toBe("ready");
  m.release(startAt);
  expect(m.phase).toBe("running");
  return m.press(startAt + 10_000)!;
}

describe("inspection result in the completion data", () => {
  it("no penalty when the solve starts within 15s", () => {
    const r = solveStartingAt(14_000);
    expect(r.timeMs).toBe(10_000);
    expect(r.inspection).toEqual({ elapsedMs: 14_000, penalty: "none" });
    expect(r.penalty).toBe("none");
  });

  it("+2 when it starts between 15s and 17s, with the boundaries inclusive", () => {
    expect(solveStartingAt(15_000).penalty).toBe("none");
    expect(solveStartingAt(15_001).penalty).toBe("plus2");
    expect(solveStartingAt(17_000).penalty).toBe("plus2");
  });

  it("DNF when it starts after 17s", () => {
    const r = solveStartingAt(17_001);
    expect(r.penalty).toBe("dnf");
    expect(r.inspection!.elapsedMs).toBe(17_001);
  });

  it("no inspection result at all with inspection off", () => {
    const m = make();
    m.press(0);
    m.release(HOLD);
    const r = m.press(HOLD + 8000)!;
    expect(r.inspection).toBeNull();
    expect(r.penalty).toBe("none");
  });

  it("reports the penalty a start would earn while still inspecting", () => {
    const m = make({ inspectionEnabled: true });
    m.press(0);
    m.release(10);
    expect(m.pendingPenalty(14_000)).toBe("none");
    expect(m.pendingPenalty(16_000)).toBe("plus2");
    expect(m.pendingPenalty(18_000)).toBe("dnf");
    expect(m.inspectionRemainingMs(16_000)).toBe(0);
  });

  it("the first hold of inspection can start the solve directly", () => {
    const m = make({ inspectionEnabled: true });
    m.press(0);
    m.tick(HOLD);
    expect(m.phase).toBe("ready");
    m.release(2000);
    expect(m.press(3000)!.inspection).toEqual({ elapsedMs: 2000, penalty: "none" });
  });
});

describe("hold to start", () => {
  it("releasing one millisecond early does not start", () => {
    const m = make();
    m.press(0);
    m.release(HOLD - 1);
    expect(m.phase).toBe("idle");
  });

  it("releasing exactly on time starts, even if no frame ticked in between", () => {
    const m = make();
    m.press(0);
    m.release(HOLD);
    expect(m.phase).toBe("running");
  });
});

describe("keyboard auto-repeat", () => {
  it("repeated keydowns while holding change nothing", () => {
    const m = make();
    m.press(0);
    for (let t = 30; t < HOLD; t += 30) expect(m.press(t)).toBeNull();
    // The hold still arms from the *first* press, not the last repeat.
    m.tick(HOLD);
    expect(m.phase).toBe("ready");
    m.press(HOLD + 30);
    expect(m.phase).toBe("ready");
    m.release(HOLD + 60);
    expect(m.phase).toBe("running");
  });

  it("the input layer drops repeat keydowns and ignores typing in fields", () => {
    expect(keyAction({ type: "keydown", code: "Space", repeat: false, inField: false })).toBe("press");
    expect(keyAction({ type: "keydown", code: "Space", repeat: true, inField: false })).toBeNull();
    expect(keyAction({ type: "keyup", code: "Space", repeat: false, inField: false })).toBe("release");
    expect(keyAction({ type: "keydown", code: "Space", repeat: false, inField: true })).toBeNull();
    expect(keyAction({ type: "keydown", code: "Escape", repeat: false, inField: false })).toBe("reset");
    expect(keyAction({ type: "keydown", code: "KeyA", repeat: false, inField: false })).toBeNull();
  });
});

describe("touch cancellation", () => {
  it("a cancelled hold goes back to idle", () => {
    const m = make();
    m.press(0);
    m.cancel();
    expect(m.phase).toBe("idle");
    // A stray touchend afterwards does nothing.
    m.release(500);
    expect(m.phase).toBe("idle");
  });

  it("a cancelled, fully armed hold never starts the solve", () => {
    const m = make();
    m.press(0);
    m.tick(HOLD);
    expect(m.phase).toBe("ready");
    m.cancel();
    expect(m.phase).toBe("idle");
    m.release(HOLD + 100);
    expect(m.phase).toBe("idle");
  });

  it("cancelling during inspection keeps inspection — and its penalty clock — running", () => {
    const m = make({ inspectionEnabled: true });
    m.press(0);
    m.tick(HOLD);
    m.cancel();
    expect(m.phase).toBe("inspecting");
    expect(m.pendingPenalty(16_000)).toBe("plus2");
    m.press(16_000);
    m.release(16_100);
    expect(m.press(20_000)!.penalty).toBe("plus2");
  });

  it("cancel does nothing to a running solve", () => {
    const m = make();
    m.press(0);
    m.release(HOLD);
    m.cancel();
    expect(m.phase).toBe("running");
  });
});

describe("phase splits", () => {
  it("marks splits, then stops on the last press", () => {
    const m = make({ phaseCount: 3 });
    m.press(0);
    m.release(HOLD);
    expect(m.press(HOLD + 2000)).toBeNull();
    expect(m.press(HOLD + 5000)).toBeNull();
    const r = m.press(HOLD + 9000)!;
    expect(r.splits).toEqual([2000, 5000]);
    expect(r.timeMs).toBe(9000);
  });

  it("a new attempt clears the previous result and inspection", () => {
    const m = make({ inspectionEnabled: true });
    // Attempt 1: started 16s into inspection → +2.
    m.press(0);
    m.release(50);
    m.press(16_000);
    m.release(16_050);
    expect(m.press(26_000)!.penalty).toBe("plus2");
    expect(m.lastResult!.penalty).toBe("plus2");
    // Attempt 2 (a new inspection from 30s): held straight through and started at once.
    m.press(30_000);
    expect(m.lastResult).toBeNull();
    m.release(30_000 + HOLD);
    const r = m.press(35_000)!;
    expect(r.penalty).toBe("none");
    expect(r.inspection!.elapsedMs).toBe(HOLD);
  });
});
