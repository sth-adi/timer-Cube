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
  Sparkles,
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
import { PostSolveTable } from "@/components/timer/PostSolveTable";
import { PostSolveCoachCard } from "@/components/timer/PostSolveCoachCard";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps, rollingTps } from "@/lib/analysis/tps";
import { buildPostSolveRows } from "@/lib/analysis/postSolveTable";
import { computeSessionStats, normalSolves } from "@/lib/stats/stats";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { buildPostSolveBaseline, paceFor, type PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { playSolveChime } from "@/lib/utils/sound";
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
}: {
  durations: (number | null)[];
  currentPhaseIndex: number;
  liveCurrentMs: number | null;
  /** Your usual time per phase: a finished phase reads green when it was one of your good ones, amber when slow. */
  baseline?: PostSolveBaseline | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PHASE_LABELS_4.map((label, i) => {
        const done = durations[i];
        const isCurrent = i === currentPhaseIndex;
        const pace = paceFor(done, baseline?.phases[i] ?? null);
        // Already past your usual for this phase while it's still running: worth knowing now.
        const overdue = isCurrent && liveCurrentMs !== null && (baseline?.phases[i]?.medianMs ?? Infinity) * 1.3 < liveCurrentMs;
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
            {label} {done !== null ? formatTime(done) : isCurrent && liveCurrentMs !== null ? formatTime(liveCurrentMs) : "—"}
          </span>
        );
      })}
    </div>
  );
}

function CaseBadges({ ollCaseName, pllCaseName }: { ollCaseName: string | null; pllCaseName: string | null }) {
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {ollCaseName && (
        <span className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {oll?.icon}
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1">
              <Sparkles size={11} /> OLL: {ollCaseName}
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
    connect,
    disconnect,
    cancel,
    refreshBattery,
    resyncSolved,
    stateSource,
    reportsState,
    correctedDuringSolve,
  } = useSmartCubeStore();
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const previousScramble = useScrambleStore((s) => s.previousScramble);
  const canGoBack = useScrambleStore((s) => s.canGoBack);
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const cubeGesturesOn = useSettingsStore((s) => s.cubeGestures);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const sessionSolves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const summarizeHeartRate = useHeartRateStore((s) => s.summarize);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  // The post-solve extras (coach, mistakes, inspection, pace, gyro, X-ray) wait behind one tap.
  const [showDetails, setShowDetails] = useState(false);

  // Auto-verifies the physical scramble against `scramble` and hands off to
  // inspection the instant it matches — see the hook for the full state
  // machine. Only meaningful before `arm()` has been called; once armed,
  // the existing recording/solved-detection below takes over.
  const flow = useSmartCubeFlow(scramble);
  // Step-by-step scramble guidance, with live undo instructions for wrong turns.
  useScrambleGuide(scramble, connected && !armed && !recording && flow.phase === "scrambling");
  const pacer = useSplitPacer();

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

  // For the post-solve coach card: this session's own mean/best, read
  // whether or not this exact solve has landed in `sessionSolves` yet (the
  // store refetches asynchronously after recordSolve, and the coach card
  // only needs an approximate "compared to your usual pace" framing, not a
  // stat that must exclude this solve to the millisecond).
  const coachSessionStats = useMemo(() => computeSessionStats(normalSolves(sessionSolves)), [sessionSolves]);
  // The ghost target for GhostPaceBar — same "ordinary solves only" convention as PB detection, so an OH attempt never races a 2-handed best.
  const normalPbMs = useMemo(() => (pendingEvent === null ? coachSessionStats.best : null), [pendingEvent, coachSessionStats.best]);

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
      const prediction = scramble ? predictSolveTime(normalSolves(sessionSolves), scramble) : null;
      auraTargetRef.current = (prediction?.skill?.useful ? prediction.predictedMs : null) ?? normalPbMs ?? null;
    }
    if (!recording) {
      auraTargetRef.current = null;
      resetPerformanceAura();
    }
    prevRecordingForAuraRef.current = recording;
  }, [recording, scramble, sessionSolves, normalPbMs]);

  useEffect(() => {
    if (!recording || auraTargetRef.current === null) return;
    setPerformanceAura(paceFromRatio(elapsedMs, auraTargetRef.current));
  }, [elapsedMs, recording]);

  useEffect(() => () => resetPerformanceAura(), []);

  // "5.20s" means nothing on its own — this reads it against your own history
  // for the post-solve table (see postSolveBaseline.ts). All-time, not just
  // this session: a fairer, less noisy reference than a handful of solves
  // since you last opened the app.
  const postSolveBaseline = useMemo(() => buildPostSolveBaseline(metricsFor(allSolves)), [allSolves]);

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
      pendingEvent ?? undefined,
      turnsAddUp ? reconstruction : undefined,
      heartRate,
      crossMs,
      turnsAddUp ? moveTimestampsRel : undefined,
      gyro ? { rotations: gyro.rotations, orientedReconstruction: gyro.orientedReconstruction, stream: gyro.stream } : undefined,
      // Inspection ran from the moment the scramble matched to the first
      // turn: +2 past 15s, DNF past 17s — same rule as the keyboard timer.
      flow.inspectionStartedAtMs !== null ? inspectionPenalty(startedAtMs! - flow.inspectionStartedAtMs) : undefined,
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
    void nextScramble();
  }, [
    finished,
    flow.inspectionStartedAtMs,
    solvedAtMs,
    moves,
    startedAtMs,
    elapsedMs,
    scramble,
    boundaries,
    crossMs,
    pendingEvent,
    recordSolve,
    summarizeHeartRate,
    soundEnabled,
    nextScramble,
    reconstruction,
    moveTimestampsRel,
    protocolName,
    correctedDuringSolve,
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

  const mimicScramble = finished ? finishedScramble : scramble;

  // Ways out of a solve that won't finish by itself — the cube missed a turn
  // (so its tracked state will never read solved), or you've given up.
  const [stopOpen, setStopOpen] = useState(false);
  const stopSolve = (how: "dnf" | "solved" | "discard") => {
    setStopOpen(false);
    if (how !== "discard" && startedAtMs !== null) {
      // The turns recorded don't solve the scramble, so the solve keeps its time but not a reconstruction the analyses would trip over.
      const timeMs = how === "solved" ? lastMoveMs - startedAtMs : elapsedMs;
      void recordSolve(timeMs, scramble, undefined, pendingEvent ?? undefined, undefined, summarizeHeartRate(startedAtMs) ?? undefined, crossMs, undefined, undefined, how === "dnf" ? "dnf" : undefined);
    }
    // "It's solved" means the real cube is solved whatever the app thought — put the two back in step.
    if (how === "solved") resyncSolved();
    cancel();
    void nextScramble();
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
        {deviceName}
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
        <button type="button" onClick={disconnect} className="ml-2 text-muted-2 underline hover:text-muted">
          Disconnect
        </button>
      </div>

      {batterySupported && batteryLevel !== null && batteryLevel <= 12 && (
        <p className="flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-medium text-danger">
          <BatteryWarning size={12} /> Cube battery at {batteryLevel}% — a dying battery is a common cause of a mid-solve Bluetooth drop
        </p>
      )}

      {pendingEvent && (
        <p className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
          {EVENT_TAGS.find((t) => t.id === pendingEvent)?.label}
        </p>
      )}

      {armed && !recording && flow.phase === "inspecting" ? (
        <p className="tabular-timer text-center text-6xl font-bold text-danger">
          {flow.pendingPenalty === "plus2" ? "+2" : flow.pendingPenalty === "dnf" ? "DNF" : Math.ceil(flow.inspectionRemainingMs / 1000)}
        </p>
      ) : (
        (armed || recording || finished) && (
          <p className="tabular-timer text-center text-6xl font-bold">{formatTime(elapsedMs)}</p>
        )
      )}

      {/* Always mounted (not just while recording/finished) so its own idle→running transition detection — the same instant-of-liftoff logic the keyboard timer uses — actually fires; mounting it fresh already inside "running" would miss it. */}
      <GhostPaceBar phase={recording ? "running" : finished ? "stopped" : "idle"} elapsedMs={elapsedMs} pbMs={normalPbMs} hideTimes={false} />

      {(armed || recording) && gyroActive ? (
        // A gyro cube gets the live twin instead: same stickers, but it also
        // tilts and turns with the cube in your hands, and names regrips live.
        <GyroTwin size={84} showControls={false} />
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
          <PhaseSplitsRow durations={durations} currentPhaseIndex={currentPhaseIndex} liveCurrentMs={liveCurrentMs} baseline={postSolveBaseline} />
          <LiveProjection finished={false} finalMs={elapsedMs} scramble={scramble} />
          {pacer.enabled && <PaceChip calls={pacer.calls} targets={pacer.targets} />}
          <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} />
        </div>
      )}

      {finished && (
        <>
          <LiveProjection finished finalMs={elapsedMs} scramble={finishedScramble} />
          <div className="flex items-center gap-3 text-xs text-muted">
            {crossFace && crossFace !== "U" && <span>{CROSS_FACE_COLOR[crossFace]} cross</span>}
            <span>{moves.length} moves</span>
            {avgTps !== null && (
              <span>
                {avgTps.toFixed(2)} TPS{peakBucketTps > avgTps && <span className="text-muted-2"> (peak {peakBucketTps.toFixed(1)})</span>}
              </span>
            )}
            {finishedScramble &&
              (savedSolveExists ? (
                <span className="flex items-center gap-1 text-success">
                  <Check size={12} /> Saved
                </span>
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
            sessionMeanMs={coachSessionStats.mean}
            isNewPB={coachSessionStats.best !== null && elapsedMs <= coachSessionStats.best}
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
          <ScrambleGuidePanel />
          <p className="text-[11px] text-muted-2">Inspection starts automatically once it matches.</p>
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
