"use client";

import { useEffect, useRef, useState } from "react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { isScrambleComplete } from "@/lib/analysis/scrambleVerify";
import { getCubeEngineClient } from "@/lib/cube-engine/client";

/**
 * How long the cube has to sit still, still not matching the scramble,
 * before this offers a correction. Long enough that an ordinary regrip
 * pause mid-scramble never triggers it (those are well under a second even
 * with repositioning), short enough that it still feels responsive once
 * someone's actually stopped and is wondering what went wrong.
 */
const PAUSE_BEFORE_CORRECTION_MS = 1500;

/** Same WCA 15s window the keyboard timer's inspection uses (see useTimer.ts). */
export const SMART_CUBE_INSPECTION_MS = 15_000;

export type SmartCubeScramblePhase = "scrambling" | "inspecting" | "ready-to-solve";

export interface SmartCubeFlow {
  phase: SmartCubeScramblePhase;
  /** The exact moves to make right now to get back onto the target scramble — null while on track or not yet computed. */
  correction: string[] | null;
  /** True while a correction is being computed on the worker. */
  correcting: boolean;
  inspectionRemainingMs: number;
}

/**
 * Drives the smart-cube scramble → inspection handoff: watches the cube's
 * live state against the target scramble (see lib/analysis/scrambleVerify.ts),
 * auto-starts inspection the instant it matches, and offers exact corrective
 * moves if the cuber pauses partway through with the wrong state. Once
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
  const [correction, setCorrection] = useState<string[] | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [inspectionRemainingMs, setInspectionRemainingMs] = useState(SMART_CUBE_INSPECTION_MS);

  const requestIdRef = useRef(0);

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
    if (correction !== null) setCorrection(null);
    if (correcting) setCorrecting(false);
    if (inspectionRemainingMs !== SMART_CUBE_INSPECTION_MS) setInspectionRemainingMs(SMART_CUBE_INSPECTION_MS);
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
      setCorrection(null);
      setCorrecting(false);
      arm();
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

  // Still scrambling and not (yet) matched: clear any stale suggestion the
  // moment the state changes, then offer a fresh one after a genuine pause.
  const prevFaceletsRef = useRef(liveFacelets);
  useEffect(() => {
    if (phase !== "scrambling" || matched || !scramble) return undefined;

    if (prevFaceletsRef.current !== liveFacelets) setCorrection(null);
    prevFaceletsRef.current = liveFacelets;

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      setCorrecting(true);
      void getCubeEngineClient()
        .computeCorrectiveMoves(scramble, liveFacelets)
        .then((moves) => {
          if (requestIdRef.current !== requestId) return; // superseded by a later move or scramble
          setCorrection(moves);
          setCorrecting(false);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setCorrecting(false);
        });
    }, PAUSE_BEFORE_CORRECTION_MS);
    return () => window.clearTimeout(timer);
  }, [liveFacelets, scramble, phase, matched]);

  // WCA-style inspection countdown — display only, see above; the solve is
  // already armed and recording moves regardless of what this shows.
  useEffect(() => {
    if (phase !== "inspecting") return undefined;
    let raf: number;
    const start = performance.now();
    const tick = () => {
      const remaining = Math.max(0, SMART_CUBE_INSPECTION_MS - (performance.now() - start));
      setInspectionRemainingMs(remaining);
      if (remaining <= 0) {
        setPhase("ready-to-solve");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return { phase, correction, correcting, inspectionRemainingMs };
}
