"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { targetFacelets } from "@/lib/analysis/scrambleVerify";
import { INSPECTION_DNF_MS, INSPECTION_MS, inspectionPenalty } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";

/** Same WCA 15s window the keyboard timer's inspection uses (see lib/timer/timerMachine.ts). */
export const SMART_CUBE_INSPECTION_MS = INSPECTION_MS;

export type SmartCubeScramblePhase = "scrambling" | "inspecting" | "ready-to-solve";

export interface SmartCubeFlow {
  phase: SmartCubeScramblePhase;
  inspectionRemainingMs: number;
  /** The penalty the first turn would earn right now: +2 past 15s of inspection, DNF past 17s. */
  pendingPenalty: Penalty;
  /** performance.now() when inspection began (the scramble matched), or null with inspection off. */
  inspectionStartedAtMs: number | null;
}

/** What the flow owes the store's attempt right now — pure, so each rule is testable without a renderer. */
export interface FlowRuleInputs {
  phase: SmartCubeScramblePhase;
  armed: boolean;
  recording: boolean;
  /** The store's solvedAtMs: non-null while a finished solve is still on screen. */
  solvedAtMs: number | null;
  /** The live cube is exactly the target scramble. */
  matches: boolean;
  /** A match that was dropped on purpose (cancelled while still matching) and mustn't re-arm until the cube leaves it. */
  declined: boolean;
  /** This flow, not something else, armed the store's current attempt. */
  armedByFlow: boolean;
}

export interface FlowRuleOutcome {
  /** Back to "scrambling": the armed attempt is gone (cancelled, dropped) and no solve is in flight or on screen. */
  resetToScrambling: boolean;
  declined: boolean;
  /** Drop the armed attempt: the cube no longer shows the scramble it was armed against, and nothing has been solved yet. */
  cancelAttempt: boolean;
}

export function flowRules(i: FlowRuleInputs): FlowRuleOutcome {
  const resetToScrambling = i.phase !== "scrambling" && !i.armed && !i.recording && i.solvedAtMs === null;
  return {
    resetToScrambling,
    // Cancelling while the cube still matches would re-arm on the spot; wait for it to leave and come back.
    declined: (i.declined || resetToScrambling) && i.matches,
    // Once the first turn lands (recording) the cube is supposed to stop matching, so only a not-yet-started attempt is dropped.
    cancelAttempt: i.armedByFlow && i.armed && !i.recording && !i.matches,
  };
}

/**
 * Drives the smart-cube scramble → inspection handoff: watches the cube's
 * live state against the target scramble (see lib/analysis/scrambleVerify.ts),
 * and auto-starts inspection the instant it matches (step-by-step guidance
 * while scrambling is useScrambleGuide's job). Once
 * inspection ends it arms the existing smartCubeStore solve-detection and
 * gets out of the way — from there the component drives off smartCubeStore's
 * own armed/recording/solvedAtMs fields, same as before this existed.
 */
export function useSmartCubeFlow(scramble: string): SmartCubeFlow {
  const connected = useSmartCubeStore((s) => s.connected);
  const liveFacelets = useSmartCubeStore((s) => s.liveFacelets);
  const recording = useSmartCubeStore((s) => s.recording);
  const armed = useSmartCubeStore((s) => s.armed);
  const solvedAtMs = useSmartCubeStore((s) => s.solvedAtMs);
  const arm = useSmartCubeStore((s) => s.arm);
  const cancel = useSmartCubeStore((s) => s.cancel);
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);

  const [phase, setPhase] = useState<SmartCubeScramblePhase>("scrambling");
  const [inspectionRemainingMs, setInspectionRemainingMs] = useState(SMART_CUBE_INSPECTION_MS);
  const [pendingPenalty, setPendingPenalty] = useState<Penalty>("none");
  const [inspectionStartedAtMs, setInspectionStartedAtMs] = useState<number | null>(null);
  const [declined, setDeclined] = useState(false);
  // Whether this flow armed the store's current attempt (the Sat-Nav lesson and the Wake game arm it too, and aren't ours to cancel).
  const [armedByFlow, setArmedByFlow] = useState(false);

  // A new target scramble (or a fresh connection) makes any prior
  // verification state meaningless — reset for it. This adjusts state
  // during render (React's documented pattern for "reset state when a prop
  // changes": track the previous value in plain state, compare, and set
  // synchronously if it moved) rather than in an effect, since it's a plain
  // reaction to `scramble`/`connected` changing, nothing external to sync with.
  const currentResetKey = `${scramble}|${connected}`;
  const [prevResetKey, setPrevResetKey] = useState(currentResetKey);
  if (connected && prevResetKey !== currentResetKey) {
    setPrevResetKey(currentResetKey);
    if (phase !== "scrambling") setPhase("scrambling");
    if (inspectionRemainingMs !== SMART_CUBE_INSPECTION_MS) setInspectionRemainingMs(SMART_CUBE_INSPECTION_MS);
    if (pendingPenalty !== "none") setPendingPenalty("none");
    if (inspectionStartedAtMs !== null) setInspectionStartedAtMs(null);
  }

  const target = useMemo(() => (scramble === "" ? null : targetFacelets(scramble)), [scramble]);
  const matches = connected && target !== null && liveFacelets === target;

  // The armed attempt ended without a solve (cancelled from the timer, the cube
  // disconnected, ...): nothing is in flight or on screen, so go back to
  // scrambling — otherwise nothing could re-arm and the screen sat stuck on
  // "ready" until a reconnect. Same render-time adjustment as the reset above.
  const rules = flowRules({ phase, armed, recording, solvedAtMs, matches, declined, armedByFlow });
  if (armedByFlow && !armed) setArmedByFlow(false);
  if (rules.resetToScrambling) {
    setPhase("scrambling");
    if (inspectionRemainingMs !== SMART_CUBE_INSPECTION_MS) setInspectionRemainingMs(SMART_CUBE_INSPECTION_MS);
    if (pendingPenalty !== "none") setPendingPenalty("none");
    if (inspectionStartedAtMs !== null) setInspectionStartedAtMs(null);
  }
  if (rules.declined !== declined) setDeclined(rules.declined);

  const matched = phase === "scrambling" && matches && !declined;

  // The instant the live state matches the scramble, arm the solve-detector
  // right away — WCA rules let you start solving any time during (or
  // skipping) inspection, so recording has to be live from this exact
  // moment, not from whenever a visual countdown happens to finish. The
  // countdown below is purely a display; it never gates when moves count.
  // Edge-triggered off a ref so this fires exactly once per match.
  const prevMatchedRef = useRef(false);
  useEffect(() => {
    if (matched && !prevMatchedRef.current) {
      arm();
      setArmedByFlow(true);
      setInspectionStartedAtMs(inspectionEnabled ? performance.now() : null);
      setPendingPenalty("none");
      setPhase(inspectionEnabled ? "inspecting" : "ready-to-solve");
    }
    prevMatchedRef.current = matched;
  }, [matched, inspectionEnabled, arm]);

  // While armed but before the first turn, the live cube has to keep matching
  // the scramble it was armed against. It stops when a lost last scramble turn
  // gave a false match and the cube's own state report then corrects the app
  // (the store asks while armed, too): the attempt would otherwise be solved
  // against the wrong scramble. Drop it — the reset above takes the phase
  // back to "scrambling", where the match can happen for real.
  useEffect(() => {
    if (flowRules({ phase, armed, recording, solvedAtMs, matches, declined, armedByFlow }).cancelAttempt) cancel();
  }, [phase, armed, recording, solvedAtMs, matches, declined, armedByFlow, cancel]);

  // A move made mid-countdown (perfectly legal — inspection is a maximum,
  // not a minimum) means the solve has already started recording; stop
  // showing the countdown instead of leaving it stuck on screen. Ref-guarded
  // so this only fires on the transition into "recording", not every render
  // where it already holds.
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (phase === "inspecting" && recording && !prevRecordingRef.current) {
      setPhase("ready-to-solve");
    }
    prevRecordingRef.current = recording;
  }, [phase, recording]);

  // WCA-style inspection countdown. The solve is already armed and records
  // moves regardless; past 15s the countdown shows the penalty the first
  // turn will earn (+2, then DNF past 17s), which the timer applies when it
  // saves the solve — see inspectionPenalty.
  useEffect(() => {
    if (phase !== "inspecting" || inspectionStartedAtMs === null) return undefined;
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - inspectionStartedAtMs;
      setInspectionRemainingMs(Math.max(0, SMART_CUBE_INSPECTION_MS - elapsed));
      setPendingPenalty(inspectionPenalty(elapsed));
      if (elapsed > INSPECTION_DNF_MS) {
        setPhase("ready-to-solve");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, inspectionStartedAtMs]);

  return { phase, inspectionRemainingMs, pendingPenalty, inspectionStartedAtMs };
}
