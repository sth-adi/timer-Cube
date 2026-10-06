"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bluetooth, BluetoothOff, Check, ChevronDown, Radio, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSmartCubeStore, getGyroLog, type SmartCubeMove } from "@/lib/store/smartCubeStore";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { summarizeSolveGyro } from "@/lib/gyro/solveGyro";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { GyroReconstructionCard } from "@/components/lab/GyroReconstructionCard";
import { GestureHint, GestureToast } from "@/components/lab/GestureToast";
import { MistakeRadarCard } from "@/components/lab/MistakeRadarCard";
import { analyzeMistakes, mistakesByRow } from "@/lib/analysis/mistakeRadar";
import { useMistakeHabits } from "@/hooks/useMistakeHabits";
import { useFullSolve } from "@/hooks/useFullSolve";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { XrayTeaser } from "@/components/xray/XrayTeaser";
import { InspectionGradeCard } from "@/components/inspection/InspectionGradeCard";
import { inspectionReport } from "@/lib/inspection/report";
import { GazeCard } from "@/components/gaze/GazeCard";
import { analyzeGaze } from "@/lib/gaze/gaze";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { PaceChip, PaceLadderCard } from "@/components/pacer/PaceCards";
import { useSplitPacer } from "@/hooks/useSplitPacer";
import { liveMilestones } from "@/lib/pacer/pacer";
import { useCubeGestures } from "@/hooks/useCubeGestures";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useSmartCubeFlow } from "@/hooks/useSmartCubeFlow";
import { useVoiceCoach } from "@/hooks/useVoiceCoach";
import { useWakeLock } from "@/hooks/useWakeLock";
import { ConnectControls } from "@/components/smartcube/ConnectControls";
import { useFreestyle } from "@/hooks/useFreestyle";
import { useScrambleVoice } from "@/hooks/useScrambleVoice";
import { scrambleForState } from "@/lib/smartcube/adoptScramble";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { cubeIdentity } from "@/lib/smartcube/cubeIdentity";
import { SessionStrip } from "@/components/timer/SessionStrip";
import { repairLostTurns, type TurnRepair } from "@/lib/smartcube/turnRepair";
import { FreestylePanel } from "@/components/smartcube/FreestylePanel";
import { VOICE_MODES } from "@/lib/smartcube/voiceCoach";
import { useRecapStore } from "@/lib/store/recapStore";
import { useScrambleGuide } from "@/hooks/useScrambleGuide";
import { ScrambleGuidePanel } from "@/components/smartcube/ScrambleGuidePanel";
import { PredictionBadge } from "@/components/timer/PredictionBadge";
import { PHASE_TINTS } from "@/components/stats/phaseTints";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { LiveProjection } from "./LiveProjection";
import { LiveSessionCoach } from "./LiveSessionCoach";
import { LiveCubeMimic, preloadCubeViewer } from "@/components/timer/LiveCubeMimic";
import { GhostPaceBar } from "@/components/timer/GhostPaceBar";
import { PostSolveActions } from "@/components/timer/PostSolveActions";
import { LiveAura, LiveElapsed, LiveMoveLine } from "@/components/timer/liveClock";
import { liveElapsedMs } from "@/components/timer/liveClockMath";
import { StatusBanners, StatusDot, LOW_BATTERY_PERCENT, type BannerState } from "@/components/timer/StatusBanners";
import { assembleSolveSave, guardedStep, inspectionPenaltyFor, solveSaveExtras, type PhaseBoundaries } from "@/components/timer/smartCubeSave";
import { TimerStage } from "@/components/timer/TimerStage";
import { useFxPhase } from "@/lib/fx/useFxPhase";
import { fxImpact, type FxPhase } from "@/lib/fx/fxBus";
import { PostSolveTable } from "@/components/timer/PostSolveTable";
import { PostSolveCoachCard } from "@/components/timer/PostSolveCoachCard";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps } from "@/lib/analysis/tps";
import { consistencyScore } from "@/lib/analysis/cadence";
import { buildPostSolveRows } from "@/lib/analysis/postSolveTable";
import { computeSessionStats, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { avg, metricsFor, sd } from "@/lib/analytics/solveMetrics";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { buildPostSolveBaseline, paceFor, type PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { buildPhaseBests, deltaToBest, findGolds } from "@/lib/analysis/phaseBests";
import { playInspectionBeep, playSolveChime, primeAudio } from "@/lib/utils/sound";
import { EVENT_TAGS, solveFinalMs } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { CROSS_FACE_COLOR, toCrossFrame } from "@/lib/smartcube/crossFrame";
import { extractAlgExecutions } from "@/lib/xray/algMicroscope";
import { solveBreakdown } from "@/lib/analysis/solveBreakdown";
import { reconstruction as writeReconstruction } from "@/lib/analysis/reconText";
import { pbSolveRows, timeWonLost } from "@/lib/analysis/timeWonLost";
import { ReconstructionCard } from "@/components/recap/ReconstructionCard";
import { TimeWonLostCard } from "@/components/recap/TimeWonLostCard";
import { cn } from "@/lib/utils/cn";
import { PHASE_LABELS_4 } from "@/components/timer/phaseRibbonMath";
import { PhaseRibbon } from "@/components/timer/PhaseRibbon";
import { CaseBadges } from "@/components/timer/CaseBadges";
import { SolveHeader } from "@/components/timer/SolveHeader";
import { DroppedSolveView } from "@/components/timer/DisconnectBanner";
import { LiveInspectionDigits, LiveInspectionRing, LiveInspectionTicks } from "@/components/timer/LiveInspection";
import { RecapHero } from "@/components/timer/RecapHero";
import { RecapNotices } from "@/components/timer/RecapNotices";
import { RecapActionBar } from "@/components/timer/RecapActionBar";

/**
 * Layout variants. Portrait phone is the base layout and none of these touch it: the wrapper
 * divs are `display: contents` there, so their children lay out exactly as direct children of the root.
 *  - Landscape on a short screen (a phone on its side) while a solve is live: the 3D cube sits beside the digits.
 *  - The recap at the lg breakpoint: time, ribbon and actions on the left, the table and cards on the right.
 */
const LIVE_ROOT = "[@media(orientation:landscape)_and_(max-height:500px)]:max-w-3xl";
const LIVE_LEFT =
  "[@media(orientation:landscape)_and_(max-height:500px)]:grid [@media(orientation:landscape)_and_(max-height:500px)]:w-full [@media(orientation:landscape)_and_(max-height:500px)]:grid-cols-[minmax(0,1fr)_12rem] [@media(orientation:landscape)_and_(max-height:500px)]:grid-rows-[auto_1fr] [@media(orientation:landscape)_and_(max-height:500px)]:items-start [@media(orientation:landscape)_and_(max-height:500px)]:gap-x-4 [@media(orientation:landscape)_and_(max-height:500px)]:gap-y-2.5";
const LIVE_STAGE = "[@media(orientation:landscape)_and_(max-height:500px)]:col-start-1 [@media(orientation:landscape)_and_(max-height:500px)]:row-start-1 [@media(orientation:landscape)_and_(max-height:500px)]:flex [@media(orientation:landscape)_and_(max-height:500px)]:flex-col [@media(orientation:landscape)_and_(max-height:500px)]:items-center [@media(orientation:landscape)_and_(max-height:500px)]:gap-4";
const LIVE_LINES = "[@media(orientation:landscape)_and_(max-height:500px)]:col-start-1 [@media(orientation:landscape)_and_(max-height:500px)]:row-start-2 [@media(orientation:landscape)_and_(max-height:500px)]:flex [@media(orientation:landscape)_and_(max-height:500px)]:flex-col [@media(orientation:landscape)_and_(max-height:500px)]:items-center [@media(orientation:landscape)_and_(max-height:500px)]:gap-4";
const LIVE_CUBE = "[@media(orientation:landscape)_and_(max-height:500px)]:col-start-2 [@media(orientation:landscape)_and_(max-height:500px)]:row-span-2 [@media(orientation:landscape)_and_(max-height:500px)]:row-start-1 [@media(orientation:landscape)_and_(max-height:500px)]:self-start";
const RECAP_ROOT = "lg:max-w-4xl lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-5 lg:gap-y-4";
const RECAP_TOP = "lg:col-span-2 lg:flex lg:flex-col lg:items-center lg:gap-4";
const RECAP_LEFT = "lg:col-start-1 lg:row-start-2 lg:flex lg:min-w-0 lg:flex-col lg:items-center lg:gap-4";
const RECAP_RIGHT = "lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-4";
/** After a solve ends, turns this soon are the cube settling, not a new scramble. */
const RECAP_FIDGET_GRACE_MS = 1500;
/** Turns that start a new scramble, clearing the recap. */
const RECAP_DISMISS_TURNS = 2;
const RECAP_BAR = "lg:col-start-1 lg:row-start-3";
const RECAP_DETAILS = "lg:col-span-2 lg:row-start-4 lg:flex lg:flex-col lg:gap-4";

/** Below this many qualifying turning gaps, a solve's rhythm isn't a meaningful sample — matches cadence.ts's own MIN_GAPS. */
const MIN_CADENCE_GAPS = 12;

/** Stable empties for the post-solve values, so a solve in progress doesn't rebuild them on every move. */
const NO_NUMBERS: number[] = [];
const NO_TOKENS: string[] = [];
const NO_ROWS: ReturnType<typeof buildPostSolveRows> = [];
const NO_MOVES: SmartCubeMove[] = [];

/** Each phase's own duration in ms, or null while it's not yet finished (or not yet started). */
function phaseDurations(b: PhaseBoundaries): (number | null)[] {
  const marks = [b.cross, b.f2l, b.oll, b.pll];
  const out: (number | null)[] = [];
  let prev = 0;
  for (const mark of marks) {
    if (mark === null) {
      out.push(null);
      continue;
    }
    out.push(mark - prev);
    prev = mark;
  }
  return out;
}

/** Which phase (0=cross..3=pll) a zero-based solve-elapsed timestamp falls in, for tinting the TPS bar graph the same hue as the rest of the app's phase splits. Falls back to cross's tint once boundaries aren't known yet. */
function phaseForMs(ms: number, boundaries: PhaseBoundaries | null): number {
  if (!boundaries) return 0;
  if (boundaries.cross !== null && ms < boundaries.cross) return 0;
  if (boundaries.f2l !== null && ms < boundaries.f2l) return 1;
  if (boundaries.oll !== null && ms < boundaries.oll) return 2;
  return 3;
}

/** Cubeast-style running phase breakdown: finished phases show their time, the current one counts up live. */
function PhaseSplitsRow({
  durations,
  currentPhaseIndex,
  liveCurrentMs,
  baseline,
  f2lPairCount,
  hideTimes,
  bests,
  skips,
}: {
  durations: (number | null)[];
  currentPhaseIndex: number;
  liveCurrentMs: number | null;
  /** Your usual time per phase: a finished phase reads green when it was one of your good ones, amber when slow. */
  baseline?: PostSolveBaseline | null;
  /** How many of the 4 F2L pairs are in so far — shown next to the F2L chip once at least one has landed. */
  f2lPairCount?: number;
  /** Masks every duration (and the pace/overdue judgments that depend on one) behind a placeholder — the live half of Settings' "hide time while solving". */
  hideTimes?: boolean;
  /** Your best-ever time per phase, for gold splits and the delta next to each finished one. */
  bests?: readonly (number | null)[];
  /** Phases the scramble skipped — never golds, never compared. */
  skips?: readonly boolean[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PHASE_LABELS_4.map((label, i) => {
        const delta = hideTimes ? null : deltaToBest(durations[i], bests?.[i], skips?.[i]);
        const gold = delta !== null && delta < 0;
        const done = durations[i];
        const isCurrent = i === currentPhaseIndex;
        const pace = hideTimes ? null : paceFor(done, baseline?.phases[i] ?? null);
        // Already past your usual for this phase while it's still running: worth knowing now.
        const overdue = !hideTimes && isCurrent && liveCurrentMs !== null && (baseline?.phases[i]?.medianMs ?? Infinity) * 1.3 < liveCurrentMs;
        return (
          <span
            key={label}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums",
              isCurrent
                ? overdue
                  ? "bg-warning/15 text-warning"
                  : "bg-accent-soft text-accent"
                : done !== null
                  ? gold
                    ? "bg-warning/20 text-warning ring-1 ring-warning/60"
                    : cn("bg-bg-panel-2", pace === "fast" ? "text-success" : pace === "slow" ? "text-warning" : "text-muted")
                  : "bg-bg-panel-2 text-muted-2",
            )}
            data-gold={gold || undefined}
          >
            {gold ? "★ " : ""}
            {label}
            {i === 1 && f2lPairCount ? ` ${Math.min(f2lPairCount, 4)}/4` : ""}{" "}
            {hideTimes ? "·" : done !== null ? formatTime(done) : isCurrent && liveCurrentMs !== null ? formatTime(liveCurrentMs) : "—"}
            {delta !== null && (
              <span className={cn("ml-1 text-[10px] font-normal", gold ? "text-warning" : "text-muted")}>
                {delta < 0 ? "−" : "+"}
                {(Math.abs(delta) / 1000).toFixed(2)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

const PHASE_NAMES = ["Cross", "F2L", "OLL", "PLL"] as const;

/** After a solve: the phases that set a new best, and how far this solve sat from your sum of bests. */
function GoldSummary({ golds, sumOfBestMs, totalMs }: { golds: { phase: 0 | 1 | 2 | 3; underBy: number }[]; sumOfBestMs: number | null; totalMs: number }) {
  if (golds.length === 0 && sumOfBestMs === null) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 text-[11px]" data-testid="gold-summary">
      {golds.map((g) => (
        <span key={g.phase} className="font-semibold text-warning">
          ★ New best {PHASE_NAMES[g.phase]} — {(g.underBy / 1000).toFixed(2)}s under your old one
        </span>
      ))}
      {sumOfBestMs !== null && (
        <span className="text-muted" title="Your best-ever Cross, F2L, OLL and PLL added together — a solve you've proven you can do, just never all at once">
          Sum of bests {formatTime(sumOfBestMs)} · this solve {totalMs <= sumOfBestMs ? "beat it" : `${((totalMs - sumOfBestMs) / 1000).toFixed(2)}s off`}
        </span>
      )}
    </div>
  );
}

/**
 * Timing driven by a real Bluetooth smart cube instead of the keyboard:
 * scramble it, and this verifies the physical state against the target
 * scramble live — matching it starts inspection automatically — and walks
 * you through it step by step, with live undo instructions the moment a
 * turn goes wrong (see useScrambleGuide). Once inspection ends, your first physical turn starts
 * the clock, and the moment the cube itself reports solved, the clock
 * stops and the solve saves itself — no spacebar, no save button, exactly
 * like the keyboard timer's own onComplete — and the exact moves you made
 * become a verified reconstruction automatically, ready for the analyzer
 * without retyping a single move.
 *
 * Needs a real smart cube (GAN / GiiKER / GoCube / QiYi / MoYu) and a
 * browser with Web Bluetooth (Chromium-based, HTTPS or localhost) — there's
 * no software fallback for the hardware half of this.
 */
export function SmartCubeTimer() {
  // One shallow selector rather than the whole store: only a change to one of these re-renders the screen.
  const {
    supported,
    connected,
    deviceName,
    error,
    droppedMidSolve,
    droppedMidSolveMoves,
    armed,
    recording,
    startedAtMs,
    solvedAtMs,
    crossAtMs,
    f2lAtMs,
    f2lPairAtMs,
    ollAtMs,
    ollCaseName,
    pllCaseName,
    crossFace,
    moves,
    batterySupported,
    batteryLevel,
    gyroActive,
    protocolName,
    deviceMac,
    disconnect,
    cancel,
    refreshBattery,
    resyncSolved,
    stateSource,
    reportsState,
    faceletsUnreliable,
    correctedDuringSolve,
    hardwareInfo,
    reconnect,
    reconnectNotice,
    dismissReconnectNotice,
  } = useSmartCubeStore(
    useShallow((s) => ({
      supported: s.supported,
      connected: s.connected,
      deviceName: s.deviceName,
      error: s.error,
      droppedMidSolve: s.droppedMidSolve,
      droppedMidSolveMoves: s.droppedMidSolveMoves,
      armed: s.armed,
      recording: s.recording,
      startedAtMs: s.startedAtMs,
      solvedAtMs: s.solvedAtMs,
      crossAtMs: s.crossAtMs,
      f2lAtMs: s.f2lAtMs,
      f2lPairAtMs: s.f2lPairAtMs,
      ollAtMs: s.ollAtMs,
      ollCaseName: s.ollCaseName,
      pllCaseName: s.pllCaseName,
      crossFace: s.crossFace,
      moves: s.moves,
      batterySupported: s.batterySupported,
      batteryLevel: s.batteryLevel,
      gyroActive: s.gyroActive,
      protocolName: s.protocolName,
      deviceMac: s.deviceMac,
      disconnect: s.disconnect,
      cancel: s.cancel,
      refreshBattery: s.refreshBattery,
      resyncSolved: s.resyncSolved,
      stateSource: s.stateSource,
      reportsState: s.reportsState,
      faceletsUnreliable: s.faceletsUnreliable,
      correctedDuringSolve: s.correctedDuringSolve,
      hardwareInfo: s.hardwareInfo,
      reconnect: s.reconnect,
      reconnectNotice: s.reconnectNotice,
      dismissReconnectNotice: s.dismissReconnectNotice,
    })),
  );
  const cancelReconnect = useSmartCubeStore((s) => s.cancelReconnect);
  const reconnectNow = useSmartCubeStore((s) => s.reconnectNow);
  const storeScramble = useScrambleStore((s) => s.scramble);
  const loadExternalScramble = useScrambleStore((s) => s.loadExternalScramble);
  // Freestyle: the scramble is whatever state you mix the cube into, read off
  // the cube (see useFreestyle) — until one is captured there is none.
  // Which physical cube this is, stamped on every solve it makes (see CubeGarageCard).
  const cube = useMemo(() => cubeIdentity({ deviceMac, deviceName, protocolName }), [deviceMac, deviceName, protocolName]);
  const nickname = useSettingsStore((s) => (cube ? s.cubeNicknames[cube.id] : undefined));
  const freestyle = useSettingsStore((s) => s.freestyle);
  const voiceScramble = useSettingsStore((s) => s.voiceScramble);
  const keepAwake = useSettingsStore((s) => s.keepAwake);
  const setVoiceScramble = useSettingsStore((s) => s.setVoiceScramble);
  const setFreestyle = useSettingsStore((s) => s.setFreestyle);
  // Each capture remembers which solve was on screen when it was taken; it's spent once the *next* solve has been saved (its recap exists), which frees the flow to start listening again.
  const [freestyleCapture, setFreestyleCapture] = useState<{ scramble: string; afterSolvedAtMs: number | null } | null>(null);
  const recapSavedFor = useRecapStore((s) => s.recap?.solvedAtMs ?? null);
  const freestyleSpent = !!freestyleCapture && solvedAtMs !== null && solvedAtMs !== freestyleCapture.afterSolvedAtMs && recapSavedFor === solvedAtMs;
  const scramble = freestyle ? (freestyleCapture && !freestyleSpent ? freestyleCapture.scramble : "") : storeScramble;
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const previousScramble = useScrambleStore((s) => s.previousScramble);
  const canGoBack = useScrambleStore((s) => s.canGoBack);
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const cubeGesturesOn = useSettingsStore((s) => s.cubeGestures);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const sessionSolves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const summarizeHeartRate = useHeartRateStore((s) => s.summarize);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const hideTimeWhileSolving = useSettingsStore((s) => s.hideTimeWhileSolving);
  const timerStyle = useSettingsStore((s) => s.timerStyle);
  const voiceCoach = useSettingsStore((s) => s.voiceCoach);
  const setVoiceCoach = useSettingsStore((s) => s.setVoiceCoach);
  // A gyro cube whose protocol has no saved calibration: the live twin may not track the real tilt. The way to fix it is a link to the Lab, shown between solves only (the twin hides its own link mid-solve).
  const gyroUncalibrated = useSettingsStore((s) => gyroActive && !(protocolName && s.gyroCalibrations[protocolName]));
  // The post-solve extras (coach, mistakes, inspection, pace, gyro, X-ray) wait behind one tap.
  const [showDetails, setShowDetails] = useState(false);

  // Auto-verifies the physical scramble against `scramble` and hands off to
  // inspection the instant it matches — see the hook for the full state
  // machine. Only meaningful before `arm()` has been called; once armed,
  // the existing recording/solved-detection below takes over.
  const flow = useSmartCubeFlow(scramble);
  const freestyleControls = useFreestyle(freestyle, connected && !armed && !recording && flow.phase === "scrambling", (captured) => {
    setFreestyleCapture({ scramble: captured, afterSolvedAtMs: solvedAtMs });
    loadExternalScramble(captured);
  });
  // Step-by-step scramble guidance, with live undo instructions for wrong turns.
  useScrambleGuide(scramble, connected && !armed && !recording && flow.phase === "scrambling");
  // Kept on while the cube is being reconnected too: a phone that sleeps mid-retry drops the page into the background, which ends the retrying.
  useWakeLock((connected || reconnect !== null) && keepAwake);
  useScrambleVoice(voiceScramble && connected && !armed && !recording && flow.phase === "scrambling" && !freestyle);
  const guideUndoCount = useScrambleGuideStore((s) => s.view?.undo.length ?? 0);
  const [adopting, setAdopting] = useState(false);
  // "Keep what's on the cube": when it's wandered several turns off the scramble, solve where it is instead of undoing.
  const adoptCubeAsScramble = async () => {
    if (adopting) return;
    setAdopting(true);
    try {
      const adopted = await scrambleForState(useSmartCubeStore.getState().liveFacelets);
      if (adopted) loadExternalScramble(adopted);
    } finally {
      setAdopting(false);
    }
  };
  const pacer = useSplitPacer();
  // Start the 3D viewer's download the moment a cube is connected, however it got connected (the
  // connect button, an auto-reconnect, a page reload) — not on the first mimic render, which is
  // right when inspection starts.
  useEffect(() => {
    if (connected) preloadCubeViewer();
  }, [connected]);

  // WCA-style 8s/12s audible inspection warnings — the same cues the
  // keyboard timer's inspection already plays, missing here even though
  // this flow's own inspectionRemainingMs already tracks the identical
  // 15s window. One-shot per inspection, tracked in a ref rather than
  // state since a beep is a side effect, not something to re-render for.
  const showInspection = armed && !recording && flow.phase === "inspecting";
  const beepedRef = useRef({ eight: false, twelve: false });
  useEffect(() => {
    if (!showInspection || !soundEnabled) return;
    if (!beepedRef.current.eight && flow.inspectionRemainingMs <= 7000) {
      beepedRef.current.eight = true;
      playInspectionBeep();
    }
    if (!beepedRef.current.twelve && flow.inspectionRemainingMs <= 3000) {
      beepedRef.current.twelve = true;
      playInspectionBeep(12);
    }
  }, [showInspection, soundEnabled, flow.inspectionRemainingMs]);
  // The first touch or key press is a user gesture: create and resume the audio context then, so
  // the 8s and 12s beeps still sound after the phone slept or the tab was backgrounded.
  useEffect(() => {
    if (!soundEnabled) return;
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime, { once: true, capture: true });
    window.addEventListener("keydown", prime, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", prime, { capture: true });
      window.removeEventListener("keydown", prime, { capture: true });
    };
  }, [soundEnabled]);
  useEffect(() => {
    if (!showInspection) beepedRef.current = { eight: false, twelve: false };
  }, [showInspection]);

  // Which event this attempt actually started as — captured the instant it
  // arms (inspection/recording begins), same reasoning as the keyboard
  // timer's useSolveCompletion.onStart: the event tag strip stays clickable
  // the whole time a solve is live, so reading pendingEvent fresh when the
  // solve is *saved* would mislabel the attempt if it got tapped mid-solve.
  // State (not a plain ref) since render itself needs this value.
  const [pendingEventAtStart, setPendingEventAtStart] = useState(pendingEvent);
  const prevArmedForEventRef = useRef(armed);
  useEffect(() => {
    if (armed && !prevArmedForEventRef.current) setPendingEventAtStart(pendingEvent);
    prevArmedForEventRef.current = armed;
  }, [armed, pendingEvent]);

  const finished = !armed && !recording && solvedAtMs !== null && startedAtMs !== null;
  const lastMoveMs = moves[moves.length - 1]?.timeStampMs ?? startedAtMs ?? 0;
  // The final time, once there is one. While the solve runs its clock is NOT held here: the
  // per-frame time lives in the small <LiveElapsed>/<LiveMoveLine>/<LiveAura> children
  // (see liveClock.tsx), so a frame re-renders those and not this whole screen.
  const elapsedMs = finished ? solvedAtMs! - startedAtMs! : 0;

  // Everything below that reads the finished solve (turn speed, steadiness, reconstruction,
  // analysis) is computed only once it IS finished, not rebuilt on every move of a solve in progress.
  // (While recording, the move timestamps are built once per move for the live TPS in <LiveMoveLine>.)
  const timestamps = useMemo(() => (finished || recording ? moves.map((m) => m.timeStampMs) : NO_NUMBERS), [moves, finished, recording]);
  const solvedTimestamps = finished ? timestamps : NO_NUMBERS;
  const buckets = useMemo(() => computeTpsBuckets(solvedTimestamps), [solvedTimestamps]);
  const avgTps = useMemo(() => averageTps(solvedTimestamps), [solvedTimestamps]);
  const peakBucketTps = useMemo(() => peakTps(buckets), [buckets]);
  const maxBucket = Math.max(1, peakBucketTps);
  // How *steady* the turning was, independent of how fast — the same
  // gap-based coefficient-of-variation score cadence.ts uses for past
  // solves, computed live off this solve's own timestamps so it's ready the
  // instant the solve finishes rather than waiting on a saved-solve replay.
  const turnConsistency = useMemo(() => {
    const gaps: number[] = [];
    for (let i = 1; i < solvedTimestamps.length; i++) {
      const g = solvedTimestamps[i] - solvedTimestamps[i - 1];
      if (g > 0 && g < PAUSE_MS) gaps.push(g);
    }
    if (gaps.length < MIN_CADENCE_GAPS) return null;
    return consistencyScore(avg(gaps), sd(gaps));
  }, [solvedTimestamps]);

  // Cross/F2L/OLL/PLL boundaries, detected live off the cube's own state as
  // it happens (see smartCubeStore) — always available the instant each
  // phase completes, no post-solve analysis pass to wait on.
  const boundaries: PhaseBoundaries | null = useMemo(
    () =>
      startedAtMs !== null
        ? {
            cross: crossAtMs !== null ? crossAtMs - startedAtMs : null,
            f2l: f2lAtMs !== null ? f2lAtMs - startedAtMs : null,
            oll: ollAtMs !== null ? ollAtMs - startedAtMs : null,
            pll: finished ? elapsedMs : null,
          }
        : null,
    [startedAtMs, crossAtMs, f2lAtMs, ollAtMs, finished, elapsedMs],
  );
  const durations = boundaries ? phaseDurations(boundaries) : [null, null, null, null];
  const currentPhaseIndex = durations.findIndex((d) => d === null);
  const priorBoundaryMs =
    boundaries && currentPhaseIndex > 0 ? ([boundaries.cross, boundaries.f2l, boundaries.oll][currentPhaseIndex - 1] ?? 0) : 0;
  const f2lPairCount = f2lPairAtMs.filter((t) => t !== null).length;

  // The Cubeast-style post-solve table: one row per phase with its case,
  // total time, and the recognition/execution split within it — see
  // buildPostSolveRows for exactly where each number comes from. `solvedAtMs`
  // is only passed once the solve has actually finished, so the PLL row
  // doesn't show a bogus in-progress total while still recording.
  const postSolveRows = useMemo(
    () =>
      finished
        ? buildPostSolveRows({
            moves,
            startedAtMs,
            crossAtMs,
            f2lPairAtMs,
            ollAtMs,
            solvedAtMs,
            ollCaseName,
            pllCaseName,
          })
        : NO_ROWS,
    [moves, startedAtMs, crossAtMs, f2lPairAtMs, ollAtMs, finished, solvedAtMs, ollCaseName, pllCaseName],
  );
  const crossMs = crossAtMs !== null && startedAtMs !== null ? crossAtMs - startedAtMs : undefined;

  // Which event to score against: the live tab selection while nothing's
  // finished yet (so the ghost target/live projection are ready for
  // whatever you're about to attempt), but pinned to the event this
  // just-finished solve actually started as once it's done — otherwise
  // switching tabs to line up your next attempt while the recap is still
  // up (it stays up until you scramble again) would retroactively judge
  // the solve you already did against the wrong event's history.
  const effectivePendingEvent = finished ? pendingEventAtStart : pendingEvent;

  // This session's own mean/best for whichever event this attempt is
  // tagged as — 2-handed by default, or that event's own history when one
  // of OH/feet/BLD is selected, so the ghost target, the aura, and the
  // post-solve coach card's "compared to your usual pace" framing all judge
  // an event solve against its own kind instead of an unrelated 2-handed
  // baseline (or, previously, nothing at all for the ghost target/aura).
  // Read whether or not this exact solve has landed in `sessionSolves` yet
  // (the store refetches asynchronously after recordSolve, and these only
  // need an approximate framing, not a stat that must exclude this solve to
  // the millisecond).
  const eventSessionStats = useMemo(
    () => computeSessionStats(effectivePendingEvent === null ? normalSolves(sessionSolves) : solvesForEvent(sessionSolves, effectivePendingEvent)),
    [effectivePendingEvent, sessionSolves],
  );
  const eventPbMs = eventSessionStats.best;

  // Live regrip tally: how many whole-cube rotations GyroTwin's own
  // RotationTracker has named so far this attempt — a real technique signal
  // (fewer regrips usually means a smoother solve), fed straight off the
  // same detector already driving GyroTwin's own live "y"/"x'" pop badge, no
  // separate tracking. Reset the instant a fresh attempt arms.
  const [regripCount, setRegripCount] = useState(0);
  const prevArmedForRegripRef = useRef(armed);
  useEffect(() => {
    if (armed && !prevArmedForRegripRef.current) setRegripCount(0);
    prevArmedForRegripRef.current = armed;
  }, [armed]);

  // "5.20s" means nothing on its own — this reads it against your own history
  // for the post-solve table (see postSolveBaseline.ts). All-time, not just
  // this session: a fairer, less noisy reference than a handful of solves
  // since you last opened the app. Scoped to this attempt's own event, same
  // convention as eventSessionStats above — an OH solve's phase pacing
  // shouldn't be graded against a 2-handed median (buildPostSolveBaseline
  // already requires MIN_SOLVES of its own before showing anything, so a
  // thin event history hides the pace coloring rather than showing a
  // misleading cross-event one).
  const phaseMetrics = useMemo(
    () => metricsFor(effectivePendingEvent === null ? normalSolves(allSolves) : solvesForEvent(allSolves, effectivePendingEvent)),
    [allSolves, effectivePendingEvent],
  );
  const postSolveBaseline = useMemo(() => buildPostSolveBaseline(phaseMetrics), [phaseMetrics]);
  // Your best-ever time per phase (gold splits) — frozen when a solve starts so the solve being judged can't move the bar it's judged against.
  const liveBests = useMemo(() => buildPhaseBests(phaseMetrics), [phaseMetrics]);
  const [frozenBests, setFrozenBests] = useState(liveBests);
  // The cube warnings (low battery, reconnected, corrupted state reports): full banners between
  // solves, one small dot while recording. The banners that were up when the solve began keep their
  // room (hidden) so the big time never moves when recording starts, and none can add room mid-solve.
  const bannersNow: BannerState = {
    lowBatteryLevel: batterySupported && batteryLevel !== null && batteryLevel <= LOW_BATTERY_PERCENT ? batteryLevel : null,
    reconnectNotice,
    faceletsUnreliable,
  };
  const [reservedBanners, setReservedBanners] = useState(bannersNow);
  const [wasRecording, setWasRecording] = useState(recording);
  if (recording !== wasRecording) {
    setWasRecording(recording);
    if (recording) {
      setFrozenBests(liveBests);
      setReservedBanners(bannersNow);
    }
  }
  const phaseSkips = useMemo(() => [false, false, ollCaseName === "OLL skip", pllCaseName === "PLL skip"], [ollCaseName, pllCaseName]);

  // Shared by "Full 3D analysis", "View reconstruction", and the auto-save
  // effect below — computed once here rather than re-derived at each call site.
  // Only once finished: during a solve nothing reads them (a stop mid-solve builds its own), and
  // they'd be rebuilt on every move.
  const reconstruction = useMemo(() => (finished ? moves.map((m) => m.token).join(" ") : ""), [moves, finished]);
  const moveTimestampsRel = useMemo(
    () => (finished && startedAtMs !== null ? moves.map((m) => m.timeStampMs - startedAtMs) : NO_NUMBERS),
    [moves, startedAtMs, finished],
  );

  // The scramble the currently-shown recap belongs to. Captured the instant
  // a solve saves (see the effect below) rather than read live, because
  // this component silently rolls the next target scramble the moment a
  // solve saves — so by the time anyone looks at `scramble` again while the
  // recap is still on screen, it's already the *next* one. Everything the
  // recap displays (LiveCubeMimic, "Full 3D analysis") needs to stay paired
  // with the solve it's actually showing, not whatever's live in the store.
  const storedRecap = useRecapStore((s) => s.recap);
  const recap = storedRecap && storedRecap.solvedAtMs === solvedAtMs ? storedRecap : null;
  const finishedScramble = recap?.scramble ?? "";
  const finishedGyro = recap?.gyro ?? null;
  const finishedGaze = recap?.gaze ?? null;
  // Honest about what's on disk: a recap whose solve you deleted says so.
  // Found by the id recordSolve returned for this very solve (a repeated scramble could match another one);
  // scramble + time only stands in until an id is known — a solve whose turns were corrected mid-way is saved without a reconstruction.
  const [savedIdFor, setSavedIdFor] = useState<{ solvedAtMs: number; id: string } | null>(null);
  const savedSolveId = savedIdFor && savedIdFor.solvedAtMs === solvedAtMs ? savedIdFor.id : null;
  const savedSolveExists = useSessionStore((s) =>
    savedSolveId ? s.solves.some((x) => x.id === savedSolveId) : finishedScramble ? s.solves.some((x) => x.scramble === finishedScramble && Math.abs(x.timeMs - elapsedMs) < 1) : false,
  );
  // The gyro's read on the solve that just finished (regrips, oriented
  // reconstruction) — computed once at save time from the module-level gyro
  // log, which isn't reactive state, so it's captured here alongside the
  // scramble rather than re-derived on render.
  // Where the cuber's eyes went during inspection (gyro cubes only): the
  // samples logged from arm() — the moment inspection began — to the first turn.

  // Saves the instant a solve finishes — no button, exactly like the
  // keyboard timer's own onComplete. Edge-triggered off solvedAtMs (a ref,
  // not state) so this fires exactly once per solve even though `finished`
  // keeps being true across re-renders until the next scramble is matched.
  useEffect(() => {
    // Saved already — including before this component last unmounted.
    if (!finished || solvedAtMs === null || useRecapStore.getState().recap?.solvedAtMs === solvedAtMs) return;
    // Each analysis step is guarded on its own (see assembleSolveSave): if one throws, the solve is
    // still recorded with its time, scramble and turns, just without that step's extras.
    const startMs = startedAtMs!;
    const assembly = assembleSolveSave(
      { startedAtMs: startMs, reconstruction, moveTimestampsRel, correctedDuringSolve },
      {
        gyro: () => summarizeSolveGyro(getGyroLog(), useGyroStore.getState().ref, calibrationFor(protocolName).calibration, moves, startMs),
        startFacelets: () => scrambleToFacelets(scramble),
        gaze: (startFacelets) => {
          const gyroLog = getGyroLog();
          const gazeRef = useGyroStore.getState().ref;
          return gazeRef && gyroLog.length > 0 ? analyzeGaze(gyroLog, gazeRef, calibrationFor(protocolName).calibration, gyroLog[0].atMs, startMs, startFacelets) : null;
        },
        // A turn lost over Bluetooth leaves the recorded turns short of solved. Try to put it back
        // from where the cube's state says it went missing; if that can't be done, the time still
        // stands and the recap doesn't.
        repair: () => repairLostTurns(scramble, moves.map((m) => m.token), moveTimestampsRel),
        milestonesOf: (fixed) =>
          solveBreakdown({
            id: "repair",
            sessionId: "",
            timeMs: elapsedMs,
            penalty: "none",
            scramble,
            date: 0,
            reconstruction: fixed.tokens.join(" "),
            moveTimestamps: fixed.times.map((t) => startMs + t),
          })?.milestones ?? null,
      },
    );
    if (assembly.adopt) {
      const { tokens, times, milestones } = assembly.adopt;
      guardedStep(() => useSmartCubeStore.getState().adoptRepairedSolve(tokens.map((token, i) => ({ token, timeStampMs: times[i] })), milestones), undefined);
    }
    if (assembly.failed.length > 0) console.warn("Solve saved without:", assembly.failed.join(", "));
    const { gyro, repair } = assembly;
    useRecapStore.setState({ recap: { solvedAtMs, scramble, gyro, gaze: assembly.gaze, turnLoss: assembly.turnLoss } });
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = guardedStep(() => summarizeHeartRate(startMs) ?? undefined, undefined);
    // Penalty and splits come from the same helper "It's solved" and "Save as DNF" use (see stopSolve).
    const extras = solveSaveExtras({ startedAtMs, inspectionStartedAtMs: flow.inspectionStartedAtMs, boundaries });
    const savedFor = solvedAtMs;
    void recordSolve(
      elapsedMs,
      scramble,
      assembly.repairedSplits ?? extras.splits,
      pendingEventAtStart ?? undefined,
      assembly.reconstruction,
      heartRate,
      assembly.repairedCrossMs ?? crossMs,
      assembly.moveTimestamps,
      gyro ? { rotations: gyro.rotations, orientedReconstruction: gyro.orientedReconstruction, stream: gyro.stream } : undefined,
      // Inspection ran from the moment the scramble matched to the first
      // turn: +2 past 15s, DNF past 17s — same rule as the keyboard timer.
      extras.penalty,
      cube ? { ...cube, corrected: correctedDuringSolve } : undefined,
      repair?.change,
    )
      .then((id) => {
        if (id) setSavedIdFor({ solvedAtMs: savedFor, id });
      })
      .catch((error) => console.error("Saving the solve failed", error));
    if (soundEnabled) guardedStep(() => playSolveChime(), undefined);
    // Rolls the next target scramble right away, in the background — but
    // deliberately does NOT call cancel() here, so smartCubeStore's
    // armed/recording/solvedAtMs (and therefore `finished`) stay exactly as
    // they are. The recap this drives stays on screen the whole time you're
    // physically re-scrambling; useSmartCubeFlow (watching the cube's live
    // state against this new `scramble`) is what actually clears it, by
    // calling arm() — which resets solvedAtMs to null — the instant you
    // finish scrambling to match it. No fixed timer, no refresh for no reason.
    if (!freestyle) void nextScramble();
  }, [
    freestyle,
    finished,
    flow.inspectionStartedAtMs,
    solvedAtMs,
    moves,
    startedAtMs,
    elapsedMs,
    scramble,
    boundaries,
    crossMs,
    pendingEventAtStart,
    recordSolve,
    summarizeHeartRate,
    soundEnabled,
    nextScramble,
    reconstruction,
    moveTimestampsRel,
    protocolName,
    correctedDuringSolve,
    cube,
  ]);

  // Post-solve only, like the reconstruction above: relabelling every turn on every move of a live solve is wasted work.
  const moveTokens = useMemo(() => (finished ? moves.map((m) => m.token) : NO_TOKENS), [moves, finished]);
  // The solve as the analyses read it: relabelled so its cross is on white,
  // whatever colour you actually built it on (see crossFrame.ts). Replays
  // and the scramble shown keep the real colours.
  const frameFace = crossFace ?? "U";
  const analysisScramble = useMemo(() => toCrossFrame(finishedScramble.split(/\s+/).filter(Boolean), frameFace).join(" "), [finishedScramble, frameFace]);
  const analysisTokens = useMemo(() => (finished ? toCrossFrame(moveTokens, frameFace) : NO_TOKENS), [finished, moveTokens, frameFace]);
  const analysisMoves = useMemo(() => (finished ? moves.map((m, i) => ({ ...m, token: analysisTokens[i] })) : []), [finished, moves, analysisTokens]);

  // Mistake Radar: a full move-by-move replay of the finished solve against
  // its scramble — only once it's finished and its scramble is pinned.
  // The replay-based analyses below are heavy (hundreds of ms on a phone). They key off a deferred copy of
  // `finished` so the final time and the saved check-mark paint first and the deeper recap fills in right after.
  const finishedLate = useDeferredValue(finished);
  const mistakeReport = useMemo(
    () =>
      finishedLate && finishedScramble
        ? analyzeMistakes({
            scramble: analysisScramble,
            moves: analysisTokens,
            timesMs: moveTimestampsRel,
            totalMs: elapsedMs,
          })
        : null,
    [finishedLate, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel, elapsedMs],
  );
  // All-time habit tally: only read inside "More details", so it is only worked out once that is open
  // (not on mount, and not on every save, which is exactly when the recap should paint).
  const mistakeHabitHistory = useMistakeHabits(showDetails && finished ? allSolves : undefined);

  // The just-saved solve, rebuilt the way any past solve is: where its time went, and the written reconstruction.
  const savedSolve = useSessionStore((s) =>
    savedSolveId ? s.solves.find((x) => x.id === savedSolveId) : finishedScramble ? s.solves.find((x) => x.scramble === finishedScramble && Math.abs(x.timeMs - elapsedMs) < 1) : undefined,
  );
  // Your session best before this solve, for the recap's delta: the saved solve itself is left out of it.
  const priorBestMs = useMemo(() => {
    if (!finished) return null;
    const others = savedSolve ? sessionSolves.filter((x) => x.id !== savedSolve.id) : sessionSolves;
    return computeSessionStats(effectivePendingEvent === null ? normalSolves(others) : solvesForEvent(others, effectivePendingEvent)).best;
  }, [finished, savedSolve, sessionSolves, effectivePendingEvent]);
  const savedBreakdown = useMemo(() => (savedSolve ? solveBreakdown(savedSolve) : null), [savedSolve]);
  const timeReport = useMemo(() => {
    if (!savedBreakdown || !savedSolve) return null;
    return timeWonLost(savedBreakdown.rows, postSolveBaseline, pbSolveRows(allSolves, savedSolve.id)?.rows ?? null);
  }, [savedBreakdown, savedSolve, postSolveBaseline, allSolves]);
  const recon = useMemo(
    () => (savedBreakdown && savedSolve ? writeReconstruction(savedBreakdown, savedSolve.scramble, { totalMs: savedBreakdown.totalMs, title: `${formatTime(savedSolve.timeMs)} solve` }) : null),
    [savedBreakdown, savedSolve],
  );
  // Which reconstruction step each flagged mistake landed in — saved solve
  // and mistake report share the solve's own moveTimestamps clock.
  const reconStepMistakes = useMemo(
    () => (savedBreakdown && mistakeReport ? mistakesByRow(savedBreakdown.rows, mistakeReport.mistakes) : null),
    [savedBreakdown, mistakeReport],
  );

  // The OLL and PLL algorithms you executed (and whether in one look), for the recap table.
  const executions = useMemo(
    () => (finishedLate && finishedScramble ? extractAlgExecutions({ scramble: analysisScramble, moves: analysisTokens, timesMs: moveTimestampsRel }) : []),
    [finishedLate, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel],
  );

  // Inspection Report Card: graded from how the cross came out.
  const inspection = useMemo(
    () => (finishedLate && finishedScramble ? inspectionReport(analysisScramble, analysisTokens, moveTimestampsRel) : null),
    [finishedLate, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel],
  );

  const onAnalyze = () => {
    requestAnalysis(finishedScramble, elapsedMs, savedSolve?.id, reconstruction, moveTimestampsRel);
  };

  const [showReplay, setShowReplay] = useState(false);
  // Its stored row carries the gyro stream the replay tilts the Gyro Twin with; only read once the replay is open.
  const savedFull = useFullSolve(showReplay ? (savedSolve ?? null) : null);
  // A replay opened by gesture for the last *saved* solve, when there's no
  // live recap on screen to replay instead.
  const [savedReplay, setSavedReplay] = useState<{
    scramble: string;
    reconstruction: string;
    timeMs: number;
    moveTimestamps?: number[];
  } | null>(null);

  // A manual escape hatch for "I don't want to physically re-scramble to
  // dismiss this" — jumps straight to the scrambling screen instead of
  // waiting for a match. The next scramble is already rolled (see above),
  // so this just clears the recap now rather than rolling another one.
  const onDismiss = () => {
    cancel();
  };

  // Turning the cube to scramble it again is the signal that you're done with the recap: it clears,
  // leaving the scramble, the live cube and the guide. A moment's grace and two turns keep a fidget
  // while reading it from throwing it away, and it stays while a replay is open over it.
  useEffect(() => {
    if (!finished || showReplay || savedReplay) return undefined;
    const readyAt = performance.now() + RECAP_FIDGET_GRACE_MS;
    let turns = 0;
    return subscribeRawMoves(() => {
      if (performance.now() < readyAt) return;
      if (++turns >= RECAP_DISMISS_TURNS) queueMicrotask(cancel);
    });
  }, [finished, showReplay, savedReplay, cancel]);

  // The way out of a false arm: once armed, any turn starts the clock, and every other control waits for recording.
  // Hidden again the moment recording starts (it only renders inside the `armed && !recording` hints).
  const cancelArmButton = (
    <button
      type="button"
      onClick={() => cancel()}
      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-2 underline-offset-2 hover:text-muted hover:underline"
      title="Not ready after all? Disarm — nothing is recorded, and the next scramble check starts over."
      data-testid="cancel-inspection"
    >
      Cancel
    </button>
  );

  const fxState: FxPhase = recording
    ? "running"
    : armed && flow.phase === "inspecting"
      ? "inspecting"
      : armed
        ? "ready"
        : finished
          ? "stopped"
          : "idle";
  useFxPhase(fxState);

  // Voice Coach (off by default): phase calls, the time, inspection marks, PB.
  const voiceBestMs = useMemo(
    () => computeSessionStats(effectivePendingEvent === null ? normalSolves(allSolves) : solvesForEvent(allSolves, effectivePendingEvent)).best,
    [allSolves, effectivePendingEvent],
  );
  useVoiceCoach({
    recording,
    finished,
    startedAtMs,
    crossAtMs,
    f2lAtMs,
    ollAtMs,
    solvedAtMs,
    penalty: inspectionPenaltyFor(startedAtMs, flow.inspectionStartedAtMs) ?? "none",
    baseline: postSolveBaseline,
    bestMs: voiceBestMs ?? null,
    inspecting: armed && !recording && flow.phase === "inspecting",
    inspectionRemainingMs: flow.inspectionRemainingMs,
  });
  const prevFinishedForFxRef = useRef(finished);
  useEffect(() => {
    if (finished && !prevFinishedForFxRef.current) fxImpact("solve");
    prevFinishedForFxRef.current = finished;
  }, [finished]);

  const mimicScramble = finished ? finishedScramble : scramble;

  // Ways out of a solve that won't finish by itself — the cube missed a turn
  // (so its tracked state will never read solved), or you've given up.
  const [stopOpen, setStopOpen] = useState(false);
  const stopSolve = (how: "dnf" | "solved" | "discard") => {
    setStopOpen(false);
    if (how !== "discard" && startedAtMs !== null) {
      // The turns recorded don't solve the scramble, so the solve keeps its time but not a reconstruction the analyses would trip over.
      // (A DNF keeps the clock as it stands this instant; the per-frame time isn't held in this component's state.)
      const timeMs = how === "solved" ? lastMoveMs - startedAtMs : liveElapsedMs(performance.now(), startedAtMs, lastMoveMs);
      // "It's solved" with the app's turns short of it: if a lost turn can be put back, the solve keeps its recap.
      let reconstructionOut: string | undefined;
      let timestampsOut: number[] | undefined;
      let fix: TurnRepair | null = null;
      if (how === "solved") {
        const tokens = moves.map((m) => m.token);
        const rel = moves.map((m) => m.timeStampMs - startedAtMs);
        const r = repairLostTurns(scramble, tokens, rel);
        if (r === "intact") {
          reconstructionOut = tokens.join(" ");
          timestampsOut = rel;
        } else if (r) {
          fix = r;
          reconstructionOut = r.tokens.join(" ");
          timestampsOut = r.times;
        }
      }
      // The same penalty and splits as the automatic save: an inspection +2 and the phase splits survive "It's solved", and a chosen DNF wins.
      const extras = solveSaveExtras({ startedAtMs, inspectionStartedAtMs: flow.inspectionStartedAtMs, boundaries, forcePenalty: how === "dnf" ? "dnf" : undefined });
      void recordSolve(timeMs, scramble, extras.splits, pendingEventAtStart ?? undefined, reconstructionOut, summarizeHeartRate(startedAtMs) ?? undefined, crossMs, timestampsOut, undefined, extras.penalty, cube ? { ...cube, corrected: correctedDuringSolve } : undefined, fix?.change);
    }
    // "It's solved" means the real cube is solved whatever the app thought — put the two back in step.
    if (how === "solved") resyncSolved();
    cancel();
    if (!freestyle) void nextScramble();
  };

  // Phone Back button = abort the solve. Mid-solve nobody means "leave this page"; the press would
  // otherwise navigate away with the clock still running. While a solve is recording, one extra
  // history entry sits on top of the page, so Back lands on the page itself and is taken as "abort"
  // (the time isn't saved, the timer resets, the next scramble comes up). When the solve ends any
  // other way the spare entry is removed again, so Back keeps behaving normally afterwards.
  const abortRef = useRef<() => void>(() => {});
  useEffect(() => {
    abortRef.current = () => stopSolve("discard");
  });
  const [abortedByBack, setAbortedByBack] = useState(false);
  useEffect(() => {
    if (!recording) return;
    window.history.pushState({ ...(window.history.state ?? {}), cubeSolveGuard: true }, "");
    let consumed = false;
    const onPop = () => {
      consumed = true;
      setAbortedByBack(true);
      abortRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!consumed && window.history.state?.cubeSolveGuard) window.history.back();
    };
  }, [recording]);
  useEffect(() => {
    if (!abortedByBack) return;
    const t = window.setTimeout(() => setAbortedByBack(false), 4000);
    return () => window.clearTimeout(t);
  }, [abortedByBack]);

  // Cube Gestures — hands-free control between solves, straight from the
  // cube (see lib/smartcube/gestures.ts). Each handler says what it did, or
  // null when there was nothing to act on.
  const lastSolve = sessionSolves[sessionSolves.length - 1];
  const gestureToast = useCubeGestures({
    nextScramble: () => {
      void nextScramble();
      return "Next scramble";
    },
    previousScramble: () => {
      if (!canGoBack()) return null;
      previousScramble();
      return "Previous scramble";
    },
    replayLast: () => {
      if (finished) {
        setShowReplay(true);
        return "Replaying your solve";
      }
      if (!lastSolve?.reconstruction) return null;
      setSavedReplay({
        scramble: lastSolve.scramble,
        reconstruction: lastSolve.reconstruction,
        timeMs: lastSolve.timeMs,
        moveTimestamps: lastSolve.moveTimestamps,
      });
      return "Replaying last solve";
    },
    plusTwoLast: () => {
      if (!lastSolve) return null;
      const next = lastSolve.penalty === "plus2" ? "none" : "plus2";
      void setPenalty(lastSolve.id, next);
      return next === "plus2" ? "+2 on last solve" : "+2 removed";
    },
    dnfLast: () => {
      if (!lastSolve) return null;
      const next = lastSolve.penalty === "dnf" ? "none" : "dnf";
      void setPenalty(lastSolve.id, next);
      return next === "dnf" ? "Last solve DNF" : "DNF removed";
    },
    clearPenaltyLast: () => {
      if (!lastSolve || lastSolve.penalty === "none") return null;
      void setPenalty(lastSolve.id, "none");
      return "Penalty cleared";
    },
    dismissRecap: () => {
      if (!finished) return null;
      onDismiss();
      return "Recap dismissed";
    },
    recenterGyro: () => (useGyroStore.getState().recenter() ? "Gyro re-centered" : null),
  });

  // Disconnecting on purpose mid-solve abandons it exactly as a lost link does, but the store only
  // marks the lost-link case (droppedMidSolve), so the deliberate one is remembered here to say so.
  // Cleared the moment a cube is connected again.
  const [deliberateDrop, setDeliberateDrop] = useState<{ moves: number } | null>(null);
  if (connected && deliberateDrop) setDeliberateDrop(null);
  const handleDisconnect = (solveInFlight: boolean) => {
    if (solveInFlight) setDeliberateDrop({ moves: moves.length });
    disconnect();
  };

  // `supported` is null until the browser has been asked (after hydration): show nothing rather
  // than flashing "isn't available" in a browser that does support it.
  if (supported === null) return <div className="flex flex-1" aria-busy="true" />;
  if (supported === false) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <Bluetooth size={28} className="text-muted-2" />
        <p className="max-w-xs text-sm text-muted">
          Web Bluetooth isn&apos;t available in this browser. Smart cubes connect through Chrome or Edge on desktop or Android.
        </p>
        <p className="max-w-xs text-xs text-muted-2" data-testid="bluetooth-unsupported-note">
          Safari, Firefox and every browser on iOS can&apos;t talk to Bluetooth devices, so there the keyboard and touch timer is the way to time solves.
        </p>
      </div>
    );
  }

  // The link dropped mid-solve and the store is getting it back: keep the (dimmed) clock and 3D cube
  // in view under a slim banner. The full connect screen is for everything else — a drop between
  // solves, a deliberate disconnect, or once the reconnect has given up or been cancelled.
  if (!connected && droppedMidSolve && reconnect) {
    return (
      <DroppedSolveView
        attempt={reconnect.attempt}
        trying={reconnect.trying}
        onTryNow={reconnectNow}
        onCancel={cancelReconnect}
        frozenMs={startedAtMs !== null ? lastMoveMs - startedAtMs : null}
        scramble={mimicScramble}
        moves={moves}
        moveCount={droppedMidSolveMoves}
      />
    );
  }

  if (!connected) {
    const dropped = droppedMidSolve || deliberateDrop !== null;
    const droppedMoves = droppedMidSolve ? droppedMidSolveMoves : (deliberateDrop?.moves ?? null);
    const movesInto = droppedMoves ? ` ${droppedMoves} move${droppedMoves === 1 ? "" : "s"} into your solve` : "";
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", dropped ? "bg-danger/15" : "bg-accent-soft")}>
          {dropped ? <BluetoothOff size={26} className="text-danger" /> : <Bluetooth size={26} className="text-accent" />}
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {reconnect
            ? "Reconnecting your smart cube…"
            : droppedMidSolve
              ? "Your smart cube disconnected"
              : deliberateDrop
                ? "You disconnected mid-solve"
                : "Connect your smart cube"}
        </h1>
        <p className="max-w-xs text-sm text-muted" role="status" data-testid={deliberateDrop ? "deliberate-drop-notice" : undefined}>
          {droppedMidSolve
            ? `The Bluetooth link dropped${movesInto} — not a step you missed, the connection itself. ${reconnect ? "That solve can't be saved; once the cube is back, start the scramble again." : "Reconnect and start the scramble again."}`
            : deliberateDrop
              ? `You disconnected${movesInto || " during your solve"} — that solve wasn't saved. Reconnect and start the scramble again.`
              : reconnect
                ? "The Bluetooth link dropped — keep the cube close and awake (turn a face) and it'll be picked straight back up."
                : "A GAN, GiiKER, GoCube, QiYi, or MoYu (including MHC and the WCU-series AI cubes) times and records solves straight from your physical turns — no spacebar, and the reconstruction is captured automatically, case names and all."}
        </p>
        <ConnectControls label={dropped ? "Reconnect smart cube" : "Connect smart cube"} />
        {error && (
          <p className="max-w-xs text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {!dropped && !reconnect && (
          <p className="max-w-xs text-[11px] text-muted">
            Connect it in any state: GAN, Giiker, GoCube, QiYi and MoYu&apos;s AI cubes report where every piece is. (A
            MoYu MHC can&apos;t — connect that one solved.) Then just scramble: matching the target scramble starts
            inspection automatically.
          </p>
        )}
      </div>
    );
  }

  const solveLive = armed || recording;
  const cubeTitle =
    [
      protocolName && `protocol ${protocolName}`,
      hardwareInfo?.name,
      hardwareInfo?.hardwareVersion && `hw ${hardwareInfo.hardwareVersion}`,
      hardwareInfo?.softwareVersion && `fw ${hardwareInfo.softwareVersion}`,
      hardwareInfo?.productDate && `made ${hardwareInfo.productDate}`,
      deviceMac && `MAC ${deviceMac}`,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <div className={cn("flex w-full max-w-md flex-1 flex-col items-center gap-2.5 py-1 sm:gap-4 sm:py-2", solveLive && LIVE_ROOT, finished && RECAP_ROOT)}>
      <LiveInspectionRing active={armed && !recording && flow.phase === "inspecting"} startedAtMs={flow.inspectionStartedAtMs} fallbackMs={flow.inspectionRemainingMs} />
      <LiveAura
        recording={recording}
        startedAtMs={startedAtMs}
        lastMoveMs={lastMoveMs}
        scramble={scramble}
        sessionSolves={sessionSolves}
        eventPbMs={eventPbMs}
        pendingEvent={pendingEventAtStart}
      />
      <div className={cn("contents", finished && RECAP_TOP)}>
        <SolveHeader
          name={nickname ?? deviceName}
          nameTitle={cubeTitle}
          batterySupported={batterySupported}
          batteryLevel={batteryLevel}
          onRefreshBattery={refreshBattery}
          reportsState={reportsState}
          stateSource={stateSource}
          inFlight={solveLive}
          freestyle={freestyle}
          onToggleFreestyle={() => setFreestyle(!freestyle)}
          voiceCoach={voiceCoach}
          onCycleVoice={() => setVoiceCoach(VOICE_MODES[(VOICE_MODES.findIndex((m) => m.id === voiceCoach) + 1) % VOICE_MODES.length].id)}
          onDisconnect={handleDisconnect}
          statusDot={recording ? <StatusDot state={bannersNow} /> : undefined}
        />

        {recording ? (
          // Hidden but still taking their room, so the big time doesn't shift when the solve starts; the live state is the dot above.
          <div className="invisible contents" aria-hidden="true">
            <StatusBanners state={reservedBanners} onDismissReconnect={dismissReconnectNotice} />
          </div>
        ) : (
          <StatusBanners state={bannersNow} onDismissReconnect={dismissReconnectNotice} />
        )}

        {pendingEvent && (
          <p className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {EVENT_TAGS.find((t) => t.id === pendingEvent)?.label}
          </p>
        )}
      </div>

      <div className={cn("contents", solveLive && LIVE_LEFT, finished && RECAP_LEFT)}>
        <div className={cn("contents", solveLive && LIVE_STAGE)}>
          <TimerStage state={fxState}>
            {armed && !recording && flow.phase === "inspecting" ? (
              <LiveInspectionDigits
                startedAtMs={flow.inspectionStartedAtMs}
                fallbackMs={flow.inspectionRemainingMs}
                penalty={flow.pendingPenalty}
                styleClass={timerStyle !== "glow" ? `timer-digits--${timerStyle}` : undefined}
              />
            ) : (
              recording ? (
                // The clock child: only these digits re-render each frame.
                <LiveElapsed active={!hideTimeWhileSolving} startedAtMs={startedAtMs} lastMoveMs={lastMoveMs}>
                  {(liveMs) => (
                    <p className={cn("timer-digits text-center text-6xl font-bold", timerStyle !== "glow" && `timer-digits--${timerStyle}`)}>
                      {hideTimeWhileSolving ? "solving" : formatTime(liveMs)}
                    </p>
                  )}
                </LiveElapsed>
              ) : (
                (armed || finished) && (
                  <p className={cn("timer-digits text-center text-6xl font-bold", timerStyle !== "glow" && `timer-digits--${timerStyle}`)}>{formatTime(elapsedMs)}</p>
                )
              )
            )}
          </TimerStage>

          {armed && !recording && flow.phase === "inspecting" && <LiveInspectionTicks startedAtMs={flow.inspectionStartedAtMs} fallbackMs={flow.inspectionRemainingMs} penalty={flow.pendingPenalty} />}

          {/* Always mounted (not just while recording/finished) so its own idle→running transition detection — the same instant-of-liftoff logic the keyboard timer uses — actually fires; mounting it fresh already inside "running" would miss it. */}
          <LiveElapsed active={recording} startedAtMs={startedAtMs} lastMoveMs={lastMoveMs}>
            {(liveMs) => (
              <GhostPaceBar
                phase={recording ? "running" : finished ? "stopped" : "idle"}
                elapsedMs={recording ? liveMs : elapsedMs}
                pbMs={eventPbMs}
                hideTimes={hideTimeWhileSolving && recording}
              />
            )}
          </LiveElapsed>

          {/* Right under the time once a solve is done: +2 / DNF / Note / Delete, as on the keyboard timer. A mis-scramble or fumbled stop is one tap from gone. */}
          {finished && finishedScramble && (
            <PostSolveActions
              solve={savedSolve}
              deleted={!savedSolveExists}
              onDelete={() => {
                if (savedSolve) void removeSolve(savedSolve.id);
              }}
            />
          )}

          {abortedByBack && !recording && (
            <p className="rounded-full bg-warning/15 px-3 py-1 text-[11px] font-medium text-warning" role="status" data-testid="solve-aborted">
              Solve aborted — nothing was saved
            </p>
          )}

          {recording && (
            <button
              type="button"
              onClick={() => stopSolve("discard")}
              className="flex min-h-10 items-center gap-1.5 rounded-full bg-danger/15 px-4 text-xs font-semibold text-danger transition-colors hover:bg-danger/25 active:bg-danger/25"
              title="Throw this solve away: the time isn't saved and the next scramble comes up. The phone's Back button does the same."
              data-testid="abort-solve"
            >
              <X size={13} /> Abort solve
            </button>
          )}

          {recording && (
            <LiveElapsed active startedAtMs={startedAtMs} lastMoveMs={lastMoveMs}>
              {(liveMs) => (
                <PhaseRibbon
                  durations={durations}
                  currentPhaseIndex={currentPhaseIndex}
                  liveCurrentMs={currentPhaseIndex >= 0 ? liveMs - priorBoundaryMs : null}
                  baseline={postSolveBaseline}
                  bests={frozenBests.bests}
                  f2lPairCount={f2lPairCount}
                  gold={PHASE_LABELS_4.map((_, i) => !(hideTimeWhileSolving && recording) && (deltaToBest(durations[i], frozenBests.bests?.[i], phaseSkips?.[i]) ?? 0) < 0)}
                />
              )}
            </LiveElapsed>
          )}
        </div>

        {solveLive && gyroActive ? (
          // A gyro cube gets the live twin instead: same stickers, but it also
          // tilts and turns with the cube in your hands, and names regrips live.
          <div className={cn("relative", LIVE_CUBE)}>
            {/* navLocked: no link in here may navigate away with the clock running. */}
            <GyroTwin size={84} showControls={false} navLocked onRotation={() => setRegripCount((c) => c + 1)} />
            {regripCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 rounded-full bg-bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                title="Whole-cube rotations so far this attempt — fewer usually means a smoother solve"
              >
                {regripCount} regrip{regripCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        ) : (
          !gyroActive && (
            // Mounted for as long as the cube is connected, so the 3D player is built once and is ready
            // (cubing.js loaded, WebGL context made) before inspection starts. Between solves it sits
            // invisible and out of the layout, at rest on the next scramble; arming just shows it.
            <div
              key="mimic"
              className={cn("card h-40 w-full max-w-[13rem] overflow-hidden rounded-xl", solveLive ? LIVE_CUBE : "pointer-events-none invisible absolute")}
              data-testid="live-mimic"
            >
              <LiveCubeMimic scramble={scramble} moves={solveLive ? moves : NO_MOVES} idle={!solveLive} className="h-full w-full" />
            </div>
          )
        )}

        <div className={cn("contents", solveLive && LIVE_LINES)}>
          {armed && !recording && flow.phase !== "inspecting" && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <p className="flex items-center gap-1.5 text-sm text-accent">
                <Radio size={14} className="animate-pulse" />{" "}
                {flow.pendingPenalty === "dnf" ? "Inspection ran past 17s — this attempt will be saved as a DNF" : "Waiting for your first move…"}
              </p>
              {cancelArmButton}
            </div>
          )}
          {armed && !recording && flow.phase === "inspecting" && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <p className="text-xs text-muted">Scramble verified — start solving any time, inspection is just the max.</p>
              {cancelArmButton}
            </div>
          )}
          {recording && (
            <div className="flex flex-col items-center gap-1.5">
              {/* The clock child: the move count and the live TPS (the delimited block inside it) re-render each frame on their own. */}
              <LiveMoveLine timestamps={timestamps} />
              {correctedDuringSolve && (
                <p className="text-[11px] text-warning" title="A turn went unreported over Bluetooth and was corrected from the cube's own state report — the time still stands, and when you finish the app works out where the missing turn went so the recap can still be built">
                  A turn was lost over Bluetooth — the time stands; the recap is rebuilt when you finish
                </p>
              )}
              {/* Throwing the solve away is "Abort solve" above; this is only for a cube that IS solved while the app missed a turn. 40px+ targets: it is tapped mid-solve with a cube in the other hand. */}
              {stopOpen ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button type="button" onClick={() => stopSolve("solved")} className="flex min-h-10 items-center rounded-full bg-accent px-4 text-xs font-semibold text-accent-fg" title="The cube is solved but the app missed a turn" data-testid="stop-solved">
                    It&apos;s solved — save {formatTime(lastMoveMs - (startedAtMs ?? lastMoveMs))}
                  </button>
                  <button type="button" onClick={() => stopSolve("dnf")} className="flex min-h-10 items-center rounded-full bg-bg-panel-2 px-4 text-xs font-semibold text-foreground" data-testid="stop-dnf">
                    Save as DNF
                  </button>
                  <button type="button" onClick={() => setStopOpen(false)} className="flex min-h-10 items-center px-3 text-xs text-muted" data-testid="stop-keep-going">
                    Keep going
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setStopOpen(true)}
                  className="flex min-h-10 items-center rounded-full px-3 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
                  title="The cube is solved but the clock kept running — save the time as it stands, or as a DNF"
                  data-testid="stop-solve"
                >
                  Cube solved but still running?
                </button>
              )}
              <LiveElapsed active startedAtMs={startedAtMs} lastMoveMs={lastMoveMs}>
                {(liveMs) => (
                  <>
                    <PhaseSplitsRow
                      durations={durations}
                      currentPhaseIndex={currentPhaseIndex}
                      liveCurrentMs={currentPhaseIndex >= 0 ? liveMs - priorBoundaryMs : null}
                      baseline={postSolveBaseline}
                      f2lPairCount={f2lPairCount}
                      hideTimes={hideTimeWhileSolving && recording}
                      bests={frozenBests.bests}
                      skips={phaseSkips}
                    />
                    <LiveProjection finished={false} finalMs={liveMs} scramble={scramble} pendingEvent={pendingEventAtStart} />
                  </>
                )}
              </LiveElapsed>
              {pacer.enabled && <PaceChip calls={pacer.calls} targets={pacer.targets} />}
              <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} />
            </div>
          )}
        </div>

        {finished && (
          <>
            <RecapHero finalMs={savedSolve ? solveFinalMs(savedSolve) : elapsedMs} priorBestMs={priorBestMs}>
              <PhaseRibbon
                durations={durations}
                currentPhaseIndex={currentPhaseIndex}
                liveCurrentMs={null}
                baseline={postSolveBaseline}
                bests={frozenBests.bests}
                f2lPairCount={f2lPairCount}
                gold={PHASE_LABELS_4.map((_, i) => (deltaToBest(durations[i], frozenBests.bests?.[i], phaseSkips[i]) ?? 0) < 0)}
              />
              <PhaseSplitsRow
                durations={durations}
                currentPhaseIndex={currentPhaseIndex}
                liveCurrentMs={null}
                baseline={postSolveBaseline}
                f2lPairCount={f2lPairCount}
                bests={frozenBests.bests}
                skips={phaseSkips}
              />
            </RecapHero>

            <LiveProjection finished finalMs={elapsedMs} scramble={finishedScramble} pendingEvent={savedSolve?.event ?? pendingEventAtStart} />
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
              {crossFace && crossFace !== "U" && <span>{CROSS_FACE_COLOR[crossFace]} cross</span>}
              <span>{moves.length} moves</span>
              {avgTps !== null && (
                <span>
                  {avgTps.toFixed(2)} TPS{peakBucketTps > avgTps && <span className="text-muted"> (peak {peakBucketTps.toFixed(1)})</span>}
                </span>
              )}
              {turnConsistency !== null && (
                <span title="How evenly spaced your turns were, independent of speed — a smooth stream scores higher than the same pace in bursts">
                  {turnConsistency}% steady
                </span>
              )}
              {/* A plain status, not a control: +2 / DNF / Note / Delete live in the actions under the time. */}
              {finishedScramble && savedSolveExists && savedSolve && (
                <span className="flex items-center gap-1 text-success" data-testid="recap-saved">
                  <Check size={12} aria-hidden="true" /> Saved
                </span>
              )}
            </div>

            <GoldSummary golds={findGolds(durations, frozenBests.bests, phaseSkips)} sumOfBestMs={frozenBests.sumOfBestMs} totalMs={elapsedMs} />

            <RecapNotices turnLoss={recap?.turnLoss} learnedSolveDate={savedSolveExists ? (lastSolve?.date ?? null) : null} />
          </>
        )}
      </div>

      {finished && (
        <div className={cn("contents", RECAP_RIGHT)}>
          <PostSolveTable rows={postSolveRows} scramble={analysisScramble} moves={analysisMoves} baseline={postSolveBaseline} crossFace={frameFace} executions={executions} />

          {timeReport && <TimeWonLostCard report={timeReport} />}

          <PostSolveCoachCard
            rows={postSolveRows}
            totalMs={elapsedMs}
            tps={avgTps}
            sessionMeanMs={eventSessionStats.mean}
            isNewPB={eventSessionStats.best !== null && elapsedMs <= eventSessionStats.best}
          />
        </div>
      )}

      {finished && (
        <div className={cn("contents", RECAP_DETAILS)}>
          <div className="flex w-full items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
            >
              {showDetails ? "Fewer details" : "More details"}
              <ChevronDown size={13} className={cn("transition-transform", showDetails && "rotate-180")} />
            </button>
            <div className="flex items-center gap-3">
              {finishedScramble && (
                <button
                  type="button"
                  onClick={() => {
                    if (freestyle) setFreestyleCapture({ scramble: finishedScramble, afterSolvedAtMs: solvedAtMs });
                    loadExternalScramble(finishedScramble);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                  title="Scramble this same scramble again — a second go at the same solve"
                  data-testid="redo-scramble"
                >
                  <RotateCcw size={12} /> Redo this scramble
                </button>
              )}
              <Link href="/cases" className="text-xs font-medium text-accent hover:underline">
                All your cases →
              </Link>
            </div>
          </div>

          {showDetails && (
            <div className="flex w-full flex-col gap-3">
              {buckets.length > 1 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Turn speed through the solve</p>
                  <div className="flex h-12 w-full items-end gap-0.5 rounded-lg bg-bg-panel-2 p-1.5">
                    {buckets.map((b, i) => (
                      <div
                        key={i}
                        className={cn("flex-1 rounded-sm opacity-70", PHASE_TINTS[phaseForMs(b.startMs, boundaries)])}
                        style={{ height: `${Math.max(6, (b.tps / maxBucket) * 100)}%` }}
                        title={`${b.tps.toFixed(1)} TPS — ${PHASE_LABELS_4[phaseForMs(b.startMs, boundaries)]}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {recon && <ReconstructionCard recon={recon} stepMistakes={reconStepMistakes} />}

              {mistakeReport && <MistakeRadarCard report={mistakeReport} totalMs={elapsedMs} habits={mistakeHabitHistory} />}

              {inspection && <InspectionGradeCard report={inspection} />}

              {pacer.enabled && (
                <PaceLadderCard
                  actual={liveMilestones({ startedAtMs, crossAtMs, f2lPairAtMs, f2lAtMs, ollAtMs, solvedAtMs })}
                  targets={pacer.targets}
                  targetMs={pacer.targetMs}
                />
              )}

              {finishedGyro && startedAtMs !== null && (
                <GyroReconstructionCard
                  summary={finishedGyro}
                  phases={postSolveRows.map((r) => ({ label: r.label, endMs: r.atMs !== null ? r.atMs - startedAtMs : null }))}
                />
              )}

              {finishedGaze && <GazeCard report={finishedGaze.report} facelets={finishedGaze.facelets} />}

              {finishedScramble && <XrayTeaser scramble={analysisScramble} moves={analysisTokens} timesMs={moveTimestampsRel} solveId={savedSolve?.id} />}
            </div>
          )}
        </div>
      )}

      <GestureToast toast={gestureToast} />
      {savedReplay && (
        <InstantReplaySheet
          scramble={savedReplay.scramble}
          reconstruction={savedReplay.reconstruction}
          timeMs={savedReplay.timeMs}
          moveTimestamps={savedReplay.moveTimestamps}
          onClose={() => setSavedReplay(null)}
        />
      )}

      {showReplay && (
        <InstantReplaySheet
          scramble={finishedScramble}
          reconstruction={reconstruction}
          timeMs={elapsedMs}
          penalty={savedSolve?.penalty}
          moveTimestamps={moveTimestampsRel}
          gyroStream={savedFull.solve?.gyroStream}
          onClose={() => setShowReplay(false)}
        />
      )}

      {!armed && !recording && flow.phase === "scrambling" && (
        <div className={cn("flex w-full flex-col items-center gap-3", finished && "lg:col-span-2")}>
          {finished && (
            <p className="border-t border-border pt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              Next scramble — turn the cube to start it and this recap clears
            </p>
          )}
          {scramble && !finished && (
            <div className="w-full max-w-[13rem]">
              <ScrambleNet scramble={scramble} className="w-full" />
            </div>
          )}
          {scramble && !finished && <PredictionBadge />}
          {freestyle ? (
            <FreestylePanel onCaptureNow={freestyleControls.captureNow} onUseAnyway={freestyleControls.useAnyway} />
          ) : (
            <>
              <ScrambleGuidePanel />
              {guideUndoCount >= 3 && (
                <button
                  type="button"
                  onClick={() => void adoptCubeAsScramble()}
                  disabled={adopting}
                  className="rounded-full bg-bg-panel-2 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-bg-panel disabled:opacity-50"
                  title="Skip the undo: whatever's on the cube right now becomes the scramble, and inspection starts"
                  data-testid="keep-cube"
                >
                  {adopting ? "Reading the cube…" : "Keep what's on the cube as the scramble"}
                </button>
              )}
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span>Inspection starts automatically once it matches.</span>
                <button
                  type="button"
                  onClick={() => setVoiceScramble(!voiceScramble)}
                  aria-pressed={voiceScramble}
                  className={cn("flex items-center gap-1 hover:underline", voiceScramble && "text-accent")}
                  title="Read each turn aloud as you scramble, and what to undo after a wrong one"
                  data-testid="voice-scramble"
                >
                  {voiceScramble ? <Volume2 size={11} /> : <VolumeX size={11} />} Read aloud
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={resyncSolved}
            className="text-[11px] text-muted-2 underline-offset-2 hover:text-muted hover:underline"
            title="If the app's cube doesn't match yours, solve yours and tap this"
          >
            Cube out of sync? Solve it, then tap here
          </button>
          {gyroUncalibrated && (
            <Link href="/lab" className="hit-y text-[11px] text-warning underline decoration-dotted underline-offset-2" data-testid="gyro-calibrate-link">
              Gyro uncalibrated — calibrate in Lab
            </Link>
          )}
          {cubeGesturesOn && <GestureHint />}
          <SessionStrip />
          <LiveSessionCoach />
        </div>
      )}
      {/* Last in the page so it can stay pinned while anything above it, the next-scramble block included, scrolls by. */}
      {finished && <RecapActionBar className={RECAP_BAR} onReplay={() => setShowReplay(true)} onAnalyze={onAnalyze} onDone={onDismiss} />}
    </div>
  );
}
