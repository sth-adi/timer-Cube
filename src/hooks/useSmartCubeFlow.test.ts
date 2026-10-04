import { afterEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { targetFacelets } from "@/lib/analysis/scrambleVerify";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { flowRules, type FlowRuleInputs } from "./useSmartCubeFlow";

const base: FlowRuleInputs = {
  phase: "scrambling",
  armed: false,
  recording: false,
  solvedAtMs: null,
  matches: false,
  declined: false,
  armedByFlow: false,
};
const rules = (over: Partial<FlowRuleInputs>) => flowRules({ ...base, ...over });

describe("flowRules: an armed attempt whose scramble stops matching", () => {
  it("drops it before the first turn, whatever phase inspection is in", () => {
    for (const phase of ["inspecting", "ready-to-solve"] as const) {
      expect(rules({ phase, armed: true, armedByFlow: true, matches: false }).cancelAttempt).toBe(true);
    }
  });

  it("also drops it when the scramble itself was changed under an armed attempt (phase already reset)", () => {
    expect(rules({ phase: "scrambling", armed: true, armedByFlow: true, matches: false }).cancelAttempt).toBe(true);
  });

  it("keeps it while the cube still shows the scramble", () => {
    expect(rules({ phase: "inspecting", armed: true, armedByFlow: true, matches: true }).cancelAttempt).toBe(false);
  });

  it("leaves a solve under way alone — its turns are meant to move the cube off the scramble", () => {
    expect(rules({ phase: "ready-to-solve", armed: true, recording: true, armedByFlow: true, matches: false }).cancelAttempt).toBe(false);
  });

  it("only drops an attempt this flow armed", () => {
    expect(rules({ armed: true, armedByFlow: false, matches: false }).cancelAttempt).toBe(false);
  });

  it("has nothing to drop when nothing is armed", () => {
    expect(rules({ phase: "inspecting", armed: false, armedByFlow: true, matches: false }).cancelAttempt).toBe(false);
  });
});

describe("flowRules: getting out of an armed phase", () => {
  it("returns to scrambling once the attempt is cancelled with no solve in flight (freestyle Abort solve)", () => {
    const r = rules({ phase: "ready-to-solve", armed: false, recording: false, solvedAtMs: null });
    expect(r.resetToScrambling).toBe(true);
    expect(r.declined).toBe(false);
  });

  it("does the same from inspection, e.g. a Cancel button or a dropped connection", () => {
    expect(rules({ phase: "inspecting" }).resetToScrambling).toBe(true);
  });

  it("holds off re-arming when it was cancelled while the cube still matches", () => {
    expect(rules({ phase: "inspecting", matches: true }).declined).toBe(true);
    // ...and keeps holding while it still matches, then lets go once it's turned away.
    expect(rules({ phase: "scrambling", declined: true, matches: true }).declined).toBe(true);
    expect(rules({ phase: "scrambling", declined: true, matches: false }).declined).toBe(false);
  });

  it("doesn't touch a solve that's armed, in flight, or finished and on screen", () => {
    expect(rules({ phase: "inspecting", armed: true }).resetToScrambling).toBe(false);
    expect(rules({ phase: "ready-to-solve", armed: false, recording: true }).resetToScrambling).toBe(false);
    expect(rules({ phase: "ready-to-solve", armed: false, solvedAtMs: 12_345 }).resetToScrambling).toBe(false);
  });

  it("has nothing to reset while already scrambling", () => {
    expect(rules({ phase: "scrambling" }).resetToScrambling).toBe(false);
  });
});

describe("a false scramble match that the cube then corrects", () => {
  afterEach(() => {
    useSmartCubeStore.getState().disconnect();
    delete (globalThis as Record<string, unknown>).__smartCubeTestDriver;
    vi.useRealTimers();
  });

  async function connectReportingSim() {
    const events$ = new Subject<unknown>();
    (globalThis as Record<string, unknown>).__smartCubeTestDriver = {
      connectSmartCube: async () => ({
        deviceName: "SimCube",
        protocol: { name: "Sim" },
        capabilities: { battery: false, gyroscope: false, facelets: true, hardware: false, reset: false },
        events$,
        disconnect: async () => {},
        sendCommand: async () => {},
      }),
    };
    useSmartCubeStore.setState({ supported: true });
    await useSmartCubeStore.getState().connect();
    events$.next({ type: "FACELETS", facelets: SOLVED_FACELETS, timestamp: 1_000 });
    return events$;
  }

  /** What the hook would feed flowRules from the store right now, for an attempt it armed in `phase`. */
  const inputs = (scramble: string, phase: FlowRuleInputs["phase"]): FlowRuleInputs => {
    const s = useSmartCubeStore.getState();
    return {
      phase,
      armed: s.armed,
      recording: s.recording,
      solvedAtMs: s.solvedAtMs,
      matches: s.connected && s.liveFacelets === targetFacelets(scramble),
      declined: false,
      armedByFlow: true,
    };
  };

  it("cancels the attempt, leaves nothing armed, and lets the flow go back to scrambling", async () => {
    vi.useFakeTimers();
    // The cube has really been turned through all of `turns`, but the last one never reached the app.
    const scramble = "R U R' U' F2 D L";
    const turns = scramble.split(" ");
    const events$ = await connectReportingSim();
    let t = 1_000;
    for (const m of turns.slice(0, -1)) events$.next({ type: "MOVE", move: m, timestamp: (t += 10) });
    // The app's tally says the cube is exactly on the scramble the timer is showing (a scramble that stops one turn short of what was really done): a false match.
    const shortScramble = turns.slice(0, -1).join(" ");
    expect(useSmartCubeStore.getState().liveFacelets).toBe(targetFacelets(shortScramble));
    useSmartCubeStore.getState().arm();
    expect(flowRules(inputs(shortScramble, "inspecting")).cancelAttempt).toBe(false);

    // Now the cube reports where it really is — one turn further on, no longer the scramble the attempt was armed against.
    events$.next({ type: "FACELETS", facelets: cubeFromAlg(scramble).asString(), timestamp: t + 100 });
    vi.advanceTimersByTime(500);
    const s = useSmartCubeStore.getState();
    expect(s.liveFacelets).toBe(cubeFromAlg(scramble).asString());
    expect(s.correctedDuringSolve).toBe(false);
    const rule = flowRules(inputs(shortScramble, "inspecting"));
    expect(rule.cancelAttempt).toBe(true);

    useSmartCubeStore.getState().cancel();
    expect(useSmartCubeStore.getState().armed).toBe(false);
    const after = flowRules({ ...inputs(shortScramble, "inspecting"), armedByFlow: false });
    expect(after.resetToScrambling).toBe(true);
    expect(after.declined).toBe(false);
    // And a fresh arm() still works from that state: nothing is left wedged.
    useSmartCubeStore.getState().arm();
    expect(useSmartCubeStore.getState().armed).toBe(true);
    expect(useSmartCubeStore.getState().solvedAtMs).toBeNull();
  });
});
