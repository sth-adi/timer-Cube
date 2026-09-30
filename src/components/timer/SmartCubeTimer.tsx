"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  Play,
  Radio,
  Shuffle,
  Sparkles,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { useSmartCubeStore, getGyroLog } from "@/lib/store/smartCubeStore";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { summarizeSolveGyro } from "@/lib/gyro/solveGyro";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { GyroReconstructionCard } from "@/components/lab/GyroReconstructionCard";
import { GestureHint, GestureToast } from "@/components/lab/GestureToast";
import { MistakeRadarCard } from "@/components/lab/MistakeRadarCard";
import { analyzeMistakes, mistakeHabits, mistakesByRow } from "@/lib/analysis/mistakeRadar";
import { caseStats, solveCases, type CaseGroup } from "@/lib/analysis/caseHistory";
import { XrayTeaser } from "@/components/xray/XrayTeaser";
import { InspectionGradeCard } from "@/components/inspection/InspectionGradeCard";
import { inspectionReport } from "@/lib/inspection/report";
import { GazeCard } from "@/components/gaze/GazeCard";
import { analyzeGaze } from "@/lib/gaze/gaze";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { inspectionPenalty } from "@/lib/timer/timerMachine";
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
import { useFreestyle } from "@/hooks/useFreestyle";
import { cubeIdentity } from "@/lib/smartcube/cubeIdentity";
import { FreestylePanel } from "@/components/smartcube/FreestylePanel";
import { VOICE_MODES } from "@/lib/smartcube/voiceCoach";
import { useRecapStore } from "@/lib/store/recapStore";
import { useScrambleGuide } from "@/hooks/useScrambleGuide";
import { ScrambleGuidePanel } from "@/components/smartcube/ScrambleGuidePanel";
import { PredictionBadge } from "@/components/timer/PredictionBadge";
import { PHASE_TINTS } from "@/components/stats/phaseTints";
import { predictSolveTime } from "@/lib/analysis/prediction";
import { paceFromRatio, resetPerformanceAura, setPerformanceAura } from "@/lib/store/performanceAuraBus";
import { useNowTick } from "@/hooks/useNowTick";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { LiveProjection } from "./LiveProjection";
import { LiveSessionCoach } from "./LiveSessionCoach";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { InspectionRing } from "@/components/timer/InspectionRing";
import { GhostPaceBar } from "@/components/timer/GhostPaceBar";
import { TimerStage } from "@/components/timer/TimerStage";
import { useFxPhase } from "@/lib/fx/useFxPhase";
import { fxImpact, type FxPhase } from "@/lib/fx/fxBus";
import { PostSolveTable } from "@/components/timer/PostSolveTable";
import { PostSolveCoachCard } from "@/components/timer/PostSolveCoachCard";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps, rollingTps } from "@/lib/analysis/tps";
import { consistencyScore } from "@/lib/analysis/cadence";
import { buildPostSolveRows } from "@/lib/analysis/postSolveTable";
import { computeSessionStats, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { avg, metricsFor, sd } from "@/lib/analytics/solveMetrics";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { buildPostSolveBaseline, paceFor, type PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { playInspectionBeep, playSolveChime } from "@/lib/utils/sound";
import { EVENT_TAGS } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { effectiveAlg } from "@/lib/algorithms/myAlgs";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { LearnedAlgNotice } from "@/components/algorithms/LearnedAlgNotice";
import { CROSS_FACE_COLOR, toCrossFrame } from "@/lib/smartcube/crossFrame";
import { extractAlgExecutions } from "@/lib/xray/algMicroscope";
import { solveBreakdown } from "@/lib/analysis/solveBreakdown";
import { reconstruction as writeReconstruction } from "@/lib/analysis/reconText";
import { pbSolveRows, timeWonLost } from "@/lib/analysis/timeWonLost";
import { ReconstructionCard } from "@/components/recap/ReconstructionCard";
import { TimeWonLostCard } from "@/components/recap/TimeWonLostCard";
import { cn } from "@/lib/utils/cn";

const PHASE_LABELS_4 = ["Cross", "F2L", "OLL", "PLL"] as const;

/** A case needs at least this many past occurrences before its average is trusted enough to flag as "weak". */
const MIN_CASE_OCCURRENCES = 3;
/** A case's own average total time (recognition + execution) needs to run at least this much over the group average to count as a weak case. */
const WEAK_CASE_RATIO = 1.3;
/** Below this many qualifying turning gaps, a solve's rhythm isn't a meaningful sample — matches cadence.ts's own MIN_GAPS. */
const MIN_CADENCE_GAPS = 12;

/** Cumulative phase-boundary ms (from solve start), null for a phase not yet reached. */
interface PhaseBoundaries {
  cross: number | null;
  f2l: number | null;
  oll: number | null;
  pll: number | null;
}

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
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PHASE_LABELS_4.map((label, i) => {
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
                  ? cn("bg-bg-panel-2", pace === "fast" ? "text-success" : pace === "slow" ? "text-warning" : "text-muted")
                  : "bg-bg-panel-2 text-muted-2",
            )}
          >
            {label}
            {i === 1 && f2lPairCount ? ` ${Math.min(f2lPairCount, 4)}/4` : ""}{" "}
            {hideTimes ? "·" : done !== null ? formatTime(done) : isCurrent && liveCurrentMs !== null ? formatTime(liveCurrentMs) : "—"}
          </span>
        );
      })}
    </div>
  );
}

function CaseBadges({
  ollCaseName,
  pllCaseName,
  weakOllCases,
  weakPllCases,
}: {
  ollCaseName: string | null;
  pllCaseName: string | null;
  /** Case names running meaningfully slower than your own average for the group — see WEAK_CASE_RATIO below. */
  weakOllCases: ReadonlySet<string>;
  weakPllCases: ReadonlySet<string>;
}) {
  // Your main algorithm for the case (learned or picked), else the book's.
  const chosen = useMyAlgsStore((s) => s.chosen);
  if (!ollCaseName && !pllCaseName) return null;
  const badge = (group: "OLL" | "PLL", name: string | null) => {
    if (!name) return null;
    const found = findCase(group, name);
    const alg = found ? effectiveAlg(chosen, group, name, found.alg) : undefined;
    return { icon: found ? <CaseIcon setupAlg={invertAlg(found.alg)} kind={group} className="h-9 w-9 shrink-0 overflow-hidden rounded-[4px]" /> : null, alg };
  };
  const oll = badge("OLL", ollCaseName);
  const pll = badge("PLL", pllCaseName);
  const ollWeak = ollCaseName !== null && weakOllCases.has(ollCaseName);
  const pllWeak = pllCaseName !== null && weakPllCases.has(pllCaseName);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {ollCaseName && (
        <span className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {oll?.icon}
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1">
              <Sparkles size={11} /> OLL: {ollCaseName}
              {ollWeak && (
                <TriangleAlert size={11} className="text-warning" aria-label="One of your slower OLL cases — take your time recognizing it" />
              )}
            </span>
            {oll?.alg && <span className="font-mono text-[10px] font-normal text-accent/70">{oll.alg}</span>}
          </span>
        </span>
      )}
      {pllCaseName && (
        <span className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {pll?.icon}
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1">
              <Sparkles size={11} /> PLL: {pllCaseName}
              {pllWeak && (
                <TriangleAlert size={11} className="text-warning" aria-label="One of your slower PLL cases — take your time recognizing it" />
              )}
            </span>
            {pll?.alg && <span className="font-mono text-[10px] font-normal text-accent/70">{pll.alg}</span>}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * A tappable battery readout for the connected cube — most Bluetooth cubes
 * (GAN, MoYu's AI models, QiYi) report this, but nothing in this app asked
 * for it before now. Tapping it re-requests a fresh reading rather than
 * waiting for the cube to push one on its own schedule (some protocols
 * don't push updates at all outside of an explicit request).
 */
function BatteryBadge({ level, onRefresh }: { level: number | null; onRefresh: () => void }) {
  if (level === null) {
    return (
      <button type="button" onClick={onRefresh} className="flex items-center gap-1 text-muted-2 hover:text-muted">
        <BatteryWarning size={13} />
        <span className="text-[11px]">…</span>
      </button>
    );
  }
  const Icon = level > 66 ? BatteryFull : level > 33 ? BatteryMedium : level > 12 ? BatteryLow : BatteryWarning;
  const colorClass = level > 33 ? "text-muted" : level > 12 ? "text-warning" : "text-danger";
  return (
    <button
      type="button"
      onClick={onRefresh}
      title="Tap to refresh"
      className={cn("flex items-center gap-1 tabular-nums", colorClass)}
    >
      <Icon size={13} />
      <span className="text-[11px] font-medium">{level}%</span>
    </button>
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
  const {
    supported,
    connecting,
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
    connect,
    disconnect,
    cancel,
    refreshBattery,
    resyncSolved,
    stateSource,
    reportsState,
    faceletsUnreliable,
    correctedDuringSolve,
    hardwareInfo,
  } = useSmartCubeStore();
  const storeScramble = useScrambleStore((s) => s.scramble);
  const loadExternalScramble = useScrambleStore((s) => s.loadExternalScramble);
  // Freestyle: the scramble is whatever state you mix the cube into, read off
  // the cube (see useFreestyle) — until one is captured there is none.
  // Which physical cube this is, stamped on every solve it makes (see CubeGarageCard).
  const cube = useMemo(() => cubeIdentity({ deviceMac, deviceName, protocolName }), [deviceMac, deviceName, protocolName]);
  const nickname = useSettingsStore((s) => (cube ? s.cubeNicknames[cube.id] : undefined));
  const freestyle = useSettingsStore((s) => s.freestyle);
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
  const pacer = useSplitPacer();

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
      playInspectionBeep();
    }
  }, [showInspection, soundEnabled, flow.inspectionRemainingMs]);
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
  // Ticks every frame while actually recording, same as the keyboard timer's
  // own display — without this the clock only advances when a MOVE event
  // arrives, i.e. it sits frozen during every pause between turns instead of
  // running. `nowMs` and the smart cube's own event timestamps share the
  // same performance.now() clock (see SmartCubeMove), so they're directly
  // comparable; the max() guards a single frame where rAF fires just before
  // this render sees a move that already landed a hair later.
  const nowMs = useNowTick(recording);
  const elapsedMs = recording
    ? nowMs > 0
      ? Math.max(nowMs - (startedAtMs ?? 0), lastMoveMs - (startedAtMs ?? 0))
      : lastMoveMs - (startedAtMs ?? 0)
    : finished
      ? solvedAtMs! - startedAtMs!
      : 0;

  const timestamps = useMemo(() => moves.map((m) => m.timeStampMs), [moves]);
  const buckets = useMemo(() => computeTpsBuckets(timestamps), [timestamps]);
  const avgTps = useMemo(() => averageTps(timestamps), [timestamps]);
  const peakBucketTps = useMemo(() => peakTps(buckets), [buckets]);
  const maxBucket = Math.max(1, peakBucketTps);
  // How *steady* the turning was, independent of how fast — the same
  // gap-based coefficient-of-variation score cadence.ts uses for past
  // solves, computed live off this solve's own timestamps so it's ready the
  // instant the solve finishes rather than waiting on a saved-solve replay.
  const turnConsistency = useMemo(() => {
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const g = timestamps[i] - timestamps[i - 1];
      if (g > 0 && g < PAUSE_MS) gaps.push(g);
    }
    if (gaps.length < MIN_CADENCE_GAPS) return null;
    return consistencyScore(avg(gaps), sd(gaps));
  }, [timestamps]);
  // A live speedometer: how fast your hands are moving *right now*, not the
  // whole-solve average — slides with the clock (nowMs) rather than sitting
  // at fixed one-second buckets from the start, so it reads correctly
  // whether you've been turning for 200ms or 20 seconds.
  const liveTps = recording && nowMs > 0 ? rollingTps(timestamps, nowMs) : null;

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
  const liveCurrentMs = recording && currentPhaseIndex >= 0 ? elapsedMs - priorBoundaryMs : null;

  // The Cubeast-style post-solve table: one row per phase with its case,
  // total time, and the recognition/execution split within it — see
  // buildPostSolveRows for exactly where each number comes from. `solvedAtMs`
  // is only passed once the solve has actually finished, so the PLL row
  // doesn't show a bogus in-progress total while still recording.
  const postSolveRows = useMemo(
    () =>
      buildPostSolveRows({
        moves,
        startedAtMs,
        crossAtMs,
        f2lPairAtMs,
        ollAtMs,
        solvedAtMs: finished ? solvedAtMs : null,
        ollCaseName,
        pllCaseName,
      }),
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

  // Feeds the ambient background's live pace cue (see AuroraBackground.tsx) —
  // the same signal TimerView's keyboard solves already drive, so a live
  // smart-cube attempt gets the same running-ahead/behind atmosphere instead
  // of a flat, unreactive background. Prefer the predictive model for this
  // exact scramble, falling back to the plain PB; frozen the instant
  // recording starts, same reasoning as GhostPaceBar's own target.
  const auraTargetRef = useRef<number | null>(null);
  const prevRecordingForAuraRef = useRef(recording);
  useEffect(() => {
    if (recording && !prevRecordingForAuraRef.current) {
      // The predictive model is trained on ordinary 2-handed solves only, so
      // it's only a fair target when this attempt is one too — for a
      // tagged event, eventPbMs (that event's own best) is the right target
      // outright, not a fallback behind an unrelated 2-handed estimate.
      const prediction = pendingEventAtStart === null && scramble ? predictSolveTime(normalSolves(sessionSolves), scramble) : null;
      auraTargetRef.current = (prediction?.skill?.useful ? prediction.predictedMs : null) ?? eventPbMs ?? null;
    }
    if (!recording) {
      auraTargetRef.current = null;
      resetPerformanceAura();
    }
    prevRecordingForAuraRef.current = recording;
  }, [recording, scramble, sessionSolves, eventPbMs, pendingEventAtStart]);

  useEffect(() => {
    if (!recording || auraTargetRef.current === null) return;
    setPerformanceAura(paceFromRatio(elapsedMs, auraTargetRef.current));
  }, [elapsedMs, recording]);

  useEffect(() => () => resetPerformanceAura(), []);

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
  const postSolveBaseline = useMemo(
    () =>
      buildPostSolveBaseline(
        metricsFor(effectivePendingEvent === null ? normalSolves(allSolves) : solvesForEvent(allSolves, effectivePendingEvent)),
      ),
    [allSolves, effectivePendingEvent],
  );

  // Shared by "Full 3D analysis", "View reconstruction", and the auto-save
  // effect below — computed once here rather than re-derived at each call site.
  const reconstruction = useMemo(() => moves.map((m) => m.token).join(" "), [moves]);
  const moveTimestampsRel = useMemo(
    () => (startedAtMs !== null ? moves.map((m) => m.timeStampMs - startedAtMs) : []),
    [moves, startedAtMs],
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
  const savedSolveExists = useSessionStore((s) =>
    // Matched on scramble and time — a solve whose turns were corrected mid-way is saved without a reconstruction.
    finishedScramble ? s.solves.some((x) => x.scramble === finishedScramble && Math.abs(x.timeMs - elapsedMs) < 1) : false,
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
    const gyro = summarizeSolveGyro(
      getGyroLog(),
      useGyroStore.getState().ref,
      calibrationFor(protocolName).calibration,
      moves,
      startedAtMs!,
    );
    const gyroLog = getGyroLog();
    const gazeRef = useGyroStore.getState().ref;
    const startFacelets = scrambleToFacelets(scramble);
    const gaze =
      gazeRef && gyroLog.length > 0
        ? analyzeGaze(gyroLog, gazeRef, calibrationFor(protocolName).calibration, gyroLog[0].atMs, startedAtMs!, startFacelets)
        : null;
    useRecapStore.setState({ recap: { solvedAtMs, scramble, gyro, gaze: gaze ? { report: gaze, facelets: startFacelets } : null } });
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = summarizeHeartRate(startedAtMs!) ?? undefined;
    const splits = boundaries && boundaries.f2l !== null && boundaries.oll !== null
      ? [boundaries.cross!, boundaries.f2l, boundaries.oll]
      : undefined;
    // A turn lost over Bluetooth and corrected from the cube's own report: the time and splits stand, but the recorded turns don't add up to the solve.
    const turnsAddUp = !correctedDuringSolve;
    void recordSolve(
      elapsedMs,
      scramble,
      splits,
      pendingEventAtStart ?? undefined,
      turnsAddUp ? reconstruction : undefined,
      heartRate,
      crossMs,
      turnsAddUp ? moveTimestampsRel : undefined,
      gyro ? { rotations: gyro.rotations, orientedReconstruction: gyro.orientedReconstruction, stream: gyro.stream } : undefined,
      // Inspection ran from the moment the scramble matched to the first
      // turn: +2 past 15s, DNF past 17s — same rule as the keyboard timer.
      flow.inspectionStartedAtMs !== null ? inspectionPenalty(startedAtMs! - flow.inspectionStartedAtMs) : undefined,
      cube ? { ...cube, corrected: correctedDuringSolve } : undefined,
    );
    if (soundEnabled) playSolveChime();
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

  const moveTokens = useMemo(() => moves.map((m) => m.token), [moves]);
  // The solve as the analyses read it: relabelled so its cross is on white,
  // whatever colour you actually built it on (see crossFrame.ts). Replays
  // and the scramble shown keep the real colours.
  const frameFace = crossFace ?? "U";
  const analysisScramble = useMemo(() => toCrossFrame(finishedScramble.split(/\s+/).filter(Boolean), frameFace).join(" "), [finishedScramble, frameFace]);
  const analysisTokens = useMemo(() => toCrossFrame(moveTokens, frameFace), [moveTokens, frameFace]);
  const analysisMoves = useMemo(() => moves.map((m, i) => ({ ...m, token: analysisTokens[i] })), [moves, analysisTokens]);

  // Mistake Radar: a full move-by-move replay of the finished solve against
  // its scramble — only once it's finished and its scramble is pinned.
  const mistakeReport = useMemo(
    () =>
      finished && finishedScramble
        ? analyzeMistakes({
            scramble: analysisScramble,
            moves: analysisTokens,
            timesMs: moveTimestampsRel,
            totalMs: elapsedMs,
          })
        : null,
    [finished, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel, elapsedMs],
  );
  const mistakeHabitHistory = useMemo(() => mistakeHabits(allSolves), [allSolves]);

  // Live "you're usually slow on this one" flags for the case badges — the
  // same case-history data /cases already builds, just asked live: which
  // OLL/PLL cases run meaningfully slower (recognition + execution) than
  // your own average for that group, so a heads-up shows up the instant the
  // badge names the case, not after the solve is already over.
  const weakCases = useMemo(() => {
    const occurrences = allSolves.flatMap(solveCases);
    const weakSet = (group: CaseGroup) => {
      const stats = caseStats(occurrences, group, occurrences.length).filter((s) => s.count >= MIN_CASE_OCCURRENCES);
      if (stats.length === 0) return new Set<string>();
      const avgMs = stats.reduce((sum, s) => sum + s.totalMs, 0) / stats.length;
      return new Set(stats.filter((s) => s.totalMs > avgMs * WEAK_CASE_RATIO).map((s) => s.name));
    };
    return { oll: weakSet("OLL"), pll: weakSet("PLL") };
  }, [allSolves]);

  // The just-saved solve, rebuilt the way any past solve is: where its time went, and the written reconstruction.
  const savedSolve = useSessionStore((s) => (finishedScramble ? s.solves.find((x) => x.scramble === finishedScramble && Math.abs(x.timeMs - elapsedMs) < 1) : undefined));
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
    () => (finished && finishedScramble ? extractAlgExecutions({ scramble: analysisScramble, moves: analysisTokens, timesMs: moveTimestampsRel }) : []),
    [finished, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel],
  );

  // Inspection Report Card: graded from how the cross came out.
  const inspection = useMemo(
    () => (finished && finishedScramble ? inspectionReport(analysisScramble, analysisTokens, moveTimestampsRel) : null),
    [finished, finishedScramble, analysisScramble, analysisTokens, moveTimestampsRel],
  );

  const onAnalyze = () => {
    requestAnalysis(finishedScramble, elapsedMs, undefined, reconstruction, moveTimestampsRel);
  };

  const [showReplay, setShowReplay] = useState(false);
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
    penalty: startedAtMs !== null && flow.inspectionStartedAtMs !== null ? inspectionPenalty(startedAtMs - flow.inspectionStartedAtMs) : "none",
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
      const timeMs = how === "solved" ? lastMoveMs - startedAtMs : elapsedMs;
      void recordSolve(timeMs, scramble, undefined, pendingEventAtStart ?? undefined, undefined, summarizeHeartRate(startedAtMs) ?? undefined, crossMs, undefined, undefined, how === "dnf" ? "dnf" : undefined, cube ? { ...cube, corrected: correctedDuringSolve } : undefined);
    }
    // "It's solved" means the real cube is solved whatever the app thought — put the two back in step.
    if (how === "solved") resyncSolved();
    cancel();
    if (!freestyle) void nextScramble();
  };

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

  if (!supported) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <Bluetooth size={28} className="text-muted-2" />
        <p className="text-sm text-muted">
          Web Bluetooth isn&apos;t available in this browser. Try Chrome or Edge on desktop or Android.
        </p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", droppedMidSolve ? "bg-danger/15" : "bg-accent-soft")}>
          {droppedMidSolve ? <BluetoothOff size={26} className="text-danger" /> : <Bluetooth size={26} className="text-accent" />}
        </div>
        <h1 className="text-lg font-semibold text-foreground">{droppedMidSolve ? "Your smart cube disconnected" : "Connect your smart cube"}</h1>
        <p className="max-w-xs text-sm text-muted">
          {droppedMidSolve
            ? `The Bluetooth link dropped${droppedMidSolveMoves ? ` ${droppedMidSolveMoves} move${droppedMidSolveMoves === 1 ? "" : "s"} into your solve` : ""} — not a step you missed, the connection itself. Reconnect and start the scramble again.`
            : "A GAN, GiiKER, GoCube, QiYi, or MoYu (including MHC and the WCU-series AI cubes) times and records solves straight from your physical turns — no spacebar, and the reconstruction is captured automatically, case names and all."}
        </p>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {connecting && <Loader2 size={14} className="animate-spin" />}
          {connecting ? "Connecting…" : droppedMidSolve ? "Reconnect smart cube" : "Connect smart cube"}
        </button>
        {error && <p className="max-w-xs text-xs text-danger">{error}</p>}
        {!droppedMidSolve && (
          <p className="max-w-xs text-[11px] text-muted-2">
            Connect it in any state: GAN, Giiker, GoCube, QiYi and MoYu&apos;s AI cubes report where every piece is. (A
            MoYu MHC can&apos;t — connect that one solved.) Then just scramble: matching the target scramble starts
            inspection automatically.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-4 py-2">
      <InspectionRing remainingMs={flow.inspectionRemainingMs} active={armed && !recording && flow.phase === "inspecting"} />
      <div className="flex items-center gap-1.5 text-xs text-success">
        <BluetoothConnected size={14} />
        <span
          title={
            [
              protocolName && `protocol ${protocolName}`,
              hardwareInfo?.name,
              hardwareInfo?.hardwareVersion && `hw ${hardwareInfo.hardwareVersion}`,
              hardwareInfo?.softwareVersion && `fw ${hardwareInfo.softwareVersion}`,
              hardwareInfo?.productDate && `made ${hardwareInfo.productDate}`,
              deviceMac && `MAC ${deviceMac}`,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        >
          {nickname ?? deviceName}
        </span>
        {batterySupported && (
          <>
            <span className="text-border">·</span>
            <BatteryBadge level={batteryLevel} onRefresh={refreshBattery} />
          </>
        )}
        <span className="ml-1 text-[10px] text-muted-2" title={reportsState ? "The cube reports its own state; the app checks against it whenever you pause" : "This cube can't report its state, so the app assumed it was solved when you connected"}>
          {reportsState ? (stateSource === "cube" ? "· state read from cube" : "· reading state…") : "· assumed solved at connect"}
        </span>
        <Link href="/lab" className="ml-2 flex items-center gap-1 text-accent hover:underline">
          <FlaskConical size={12} /> Lab
        </Link>
        <button
          type="button"
          onClick={() => setVoiceCoach(VOICE_MODES[(VOICE_MODES.findIndex((m) => m.id === voiceCoach) + 1) % VOICE_MODES.length].id)}
          className={cn("ml-2 flex items-center gap-1 hover:underline", voiceCoach === "off" ? "text-muted-2" : "text-accent")}
          title="Voice coach: calls your splits and time out loud. Tap to cycle Off / Splits / Full."
        >
          {voiceCoach === "off" ? <VolumeX size={12} /> : <Volume2 size={12} />} Voice: {VOICE_MODES.find((m) => m.id === voiceCoach)?.name}
        </button>
        {!armed && !recording && (
          <button
            type="button"
            onClick={() => setFreestyle(!freestyle)}
            aria-pressed={freestyle}
            className={cn("ml-2 flex items-center gap-1 hover:underline", freestyle ? "text-accent" : "text-muted-2")}
            title="Freestyle: scramble the cube any way you like — its state becomes the scramble, instead of following a generated one."
          >
            <Shuffle size={12} /> Freestyle{freestyle ? ": on" : ""}
          </button>
        )}
        <button type="button" onClick={disconnect} className="ml-2 text-muted-2 underline hover:text-muted">
          Disconnect
        </button>
      </div>

      {batterySupported && batteryLevel !== null && batteryLevel <= 12 && (
        <p className="flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-medium text-danger">
          <BatteryWarning size={12} /> Cube battery at {batteryLevel}% — a dying battery is a common cause of a mid-solve Bluetooth drop
        </p>
      )}

      {faceletsUnreliable && (
        <p
          className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-warning"
          title="Several state reports in a row came back garbled rather than just out of date — its position tracking may drift until one comes back clean. Solve it and tap 'Cube out of sync?' if a scramble or solve stops matching."
        >
          <TriangleAlert size={12} /> This cube&apos;s state reports look corrupted
        </p>
      )}

      {pendingEvent && (
        <p className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
          {EVENT_TAGS.find((t) => t.id === pendingEvent)?.label}
        </p>
      )}

      <TimerStage state={fxState}>
        {armed && !recording && flow.phase === "inspecting" ? (
          <p className={cn("timer-digits text-center text-6xl font-bold text-danger", timerStyle !== "glow" && `timer-digits--${timerStyle}`)}>
            {flow.pendingPenalty === "plus2" ? "+2" : flow.pendingPenalty === "dnf" ? "DNF" : Math.ceil(flow.inspectionRemainingMs / 1000)}
          </p>
        ) : (
          (armed || recording || finished) && (
            <p className={cn("timer-digits text-center text-6xl font-bold", timerStyle !== "glow" && `timer-digits--${timerStyle}`)}>
              {hideTimeWhileSolving && recording ? "solving" : formatTime(elapsedMs)}
            </p>
          )
        )}
      </TimerStage>

      {/* Always mounted (not just while recording/finished) so its own idle→running transition detection — the same instant-of-liftoff logic the keyboard timer uses — actually fires; mounting it fresh already inside "running" would miss it. */}
      <GhostPaceBar
        phase={recording ? "running" : finished ? "stopped" : "idle"}
        elapsedMs={elapsedMs}
        pbMs={eventPbMs}
        hideTimes={hideTimeWhileSolving && recording}
      />

      {(armed || recording) && gyroActive ? (
        // A gyro cube gets the live twin instead: same stickers, but it also
        // tilts and turns with the cube in your hands, and names regrips live.
        <div className="relative">
          <GyroTwin size={84} showControls={false} onRotation={() => setRegripCount((c) => c + 1)} />
          {regripCount > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 rounded-full bg-bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-2"
              title="Whole-cube rotations so far this attempt — fewer usually means a smoother solve"
            >
              {regripCount} regrip{regripCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      ) : (
        (armed || recording) && (
          <div className="card h-40 w-full max-w-[13rem] overflow-hidden rounded-xl">
            <LiveCubeMimic scramble={mimicScramble} moves={moves} className="h-full w-full" />
          </div>
        )
      )}

      {armed && !recording && flow.phase !== "inspecting" && (
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <Radio size={14} className="animate-pulse" />{" "}
          {flow.pendingPenalty === "dnf" ? "Inspection ran past 17s — this attempt will be saved as a DNF" : "Waiting for your first move…"}
        </p>
      )}
      {armed && !recording && flow.phase === "inspecting" && (
        <p className="text-xs text-muted-2">Scramble verified — start solving any time, inspection is just the max.</p>
      )}
      {recording && (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm text-muted">
            {moves.length} moves so far
            {liveTps !== null && liveTps > 0 && <span className="tabular-nums text-accent"> · {liveTps.toFixed(1)} TPS</span>}
            {" — solve the cube to stop"}
          </p>
          {correctedDuringSolve && (
            <p className="text-[11px] text-warning" title="A turn went unreported over Bluetooth and was corrected from the cube's own state report — the time still stands, but the move-by-move recap won't be available for this one">
              A turn was corrected mid-solve — this one saves as time only
            </p>
          )}
          {stopOpen ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button type="button" onClick={() => stopSolve("solved")} className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-fg" title="The cube is solved but the app missed a turn">
                It&apos;s solved — save {formatTime(lastMoveMs - (startedAtMs ?? lastMoveMs))}
              </button>
              <button type="button" onClick={() => stopSolve("dnf")} className="rounded-full bg-bg-panel-2 px-3 py-1.5 text-[11px] font-semibold text-foreground">
                Save as DNF
              </button>
              <button type="button" onClick={() => stopSolve("discard")} className="rounded-full bg-bg-panel-2 px-3 py-1.5 text-[11px] font-semibold text-muted">
                Discard
              </button>
              <button type="button" onClick={() => setStopOpen(false)} className="px-1 text-[11px] text-muted-2">
                Keep going
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setStopOpen(true)} className="text-[11px] text-muted-2 underline-offset-2 hover:text-muted hover:underline">
              Stop this solve…
            </button>
          )}
          <PhaseSplitsRow
            durations={durations}
            currentPhaseIndex={currentPhaseIndex}
            liveCurrentMs={liveCurrentMs}
            baseline={postSolveBaseline}
            f2lPairCount={f2lPairAtMs.filter((t) => t !== null).length}
            hideTimes={hideTimeWhileSolving && recording}
          />
          <LiveProjection finished={false} finalMs={elapsedMs} scramble={scramble} pendingEvent={pendingEventAtStart} />
          {pacer.enabled && <PaceChip calls={pacer.calls} targets={pacer.targets} />}
          <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} weakOllCases={weakCases.oll} weakPllCases={weakCases.pll} />
        </div>
      )}

      {finished && (
        <>
          <LiveProjection finished finalMs={elapsedMs} scramble={finishedScramble} pendingEvent={savedSolve?.event ?? pendingEventAtStart} />
          <div className="flex items-center gap-3 text-xs text-muted">
            {crossFace && crossFace !== "U" && <span>{CROSS_FACE_COLOR[crossFace]} cross</span>}
            <span>{moves.length} moves</span>
            {avgTps !== null && (
              <span>
                {avgTps.toFixed(2)} TPS{peakBucketTps > avgTps && <span className="text-muted-2"> (peak {peakBucketTps.toFixed(1)})</span>}
              </span>
            )}
            {turnConsistency !== null && (
              <span title="How evenly spaced your turns were, independent of speed — a smooth stream scores higher than the same pace in bursts">
                {turnConsistency}% steady
              </span>
            )}
            {finishedScramble &&
              (savedSolveExists && savedSolve ? (
                <button
                  type="button"
                  onClick={() => void removeSolve(savedSolve.id)}
                  className="group flex items-center gap-1 text-success hover:text-danger"
                  title="Mis-scramble, false start, wrong penalty — discard this solve, same as Delete/Backspace on the keyboard timer"
                >
                  <Check size={12} className="group-hover:hidden" />
                  <Trash2 size={12} className="hidden group-hover:block" />
                  <span className="group-hover:hidden">Saved</span>
                  <span className="hidden group-hover:block">Discard</span>
                </button>
              ) : (
                <span className="text-muted-2">Deleted</span>
              ))}
          </div>

          {savedSolveExists && <LearnedAlgNotice solveDate={lastSolve?.date ?? null} />}

          <PostSolveTable rows={postSolveRows} scramble={analysisScramble} moves={analysisMoves} baseline={postSolveBaseline} crossFace={frameFace} executions={executions} />

          {timeReport && <TimeWonLostCard report={timeReport} />}

          <PostSolveCoachCard
            rows={postSolveRows}
            totalMs={elapsedMs}
            tps={avgTps}
            sessionMeanMs={eventSessionStats.mean}
            isNewPB={eventSessionStats.best !== null && elapsedMs <= eventSessionStats.best}
          />

          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setShowReplay(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg"
            >
              <Play size={14} /> Replay
            </button>
            <button
              type="button"
              onClick={onAnalyze}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-bg-panel-2 px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground"
            >
              <Wand2 size={14} /> Analyze
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 rounded-full bg-bg-panel-2 px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground"
            >
              Done
            </button>
          </div>

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
            <Link href="/cases" className="text-xs font-medium text-accent hover:underline">
              All your cases →
            </Link>
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

              {finishedScramble && <XrayTeaser scramble={analysisScramble} moves={analysisTokens} timesMs={moveTimestampsRel} />}
            </div>
          )}
        </>
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
          moveTimestamps={moveTimestampsRel}
          onClose={() => setShowReplay(false)}
        />
      )}

      {!armed && !recording && flow.phase === "scrambling" && (
        <div className="flex w-full flex-col items-center gap-3">
          {finished && (
            <p className="border-t border-border pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-2">
              Next scramble — this recap stays up until you scramble it
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
              <p className="text-[11px] text-muted-2">Inspection starts automatically once it matches.</p>
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
          {cubeGesturesOn && <GestureHint />}
          <LiveSessionCoach />
        </div>
      )}
    </div>
  );
}
