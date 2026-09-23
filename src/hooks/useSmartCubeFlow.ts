"use client";

import { useEffect, useRef, useState } from "react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { isScrambleComplete } from "@/lib/analysis/scrambleVerify";
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
  const arm = useSmartCubeStore((s) => s.arm);
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);

  const [phase, setPhase] = useState<SmartCubeScramblePhase>("scrambling");
  const [inspectionRemainingMs, setInspectionRemainingMs] = useState(SMART_CUBE_INSPECTION_MS);
  const [pendingPenalty, setPendingPenalty] = useState<Penalty>("none");
  const [inspectionStartedAtMs, setInspectionStartedAtMs] = useState<number | null>(null);

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

  const matched = phase === "scrambling" && connected && scramble !== "" && isScrambleComplete(liveFacelets, scramble);

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
      setInspectionStartedAtMs(inspectionEnabled ? performance.now() : null);
      setPendingPenalty("none");
      setPhase(inspectionEnabled ? "inspecting" : "ready-to-solve");
    }
    prevMatchedRef.current = matched;
  }, [matched, inspectionEnabled, arm]);

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
