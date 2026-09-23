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
import { summarizeSolveGyro, type SolveGyroSummary } from "@/lib/gyro/solveGyro";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { GyroReconstructionCard } from "@/components/lab/GyroReconstructionCard";
import { GestureHint, GestureToast } from "@/components/lab/GestureToast";
import { MistakeRadarCard } from "@/components/lab/MistakeRadarCard";
import { analyzeMistakes } from "@/lib/analysis/mistakeRadar";
import { XrayTeaser } from "@/components/xray/XrayTeaser";
import { InspectionGradeCard } from "@/components/inspection/InspectionGradeCard";
import { inspectionReport } from "@/lib/inspection/report";
import { GazeCard } from "@/components/gaze/GazeCard";
import { analyzeGaze, type GazeReport } from "@/lib/gaze/gaze";
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
import { useScrambleGuide } from "@/hooks/useScrambleGuide";
import { ScrambleGuidePanel } from "@/components/smartcube/ScrambleGuidePanel";
import { useNowTick } from "@/hooks/useNowTick";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { PostSolveTable } from "@/components/timer/PostSolveTable";
import { PostSolveCoachCard } from "@/components/timer/PostSolveCoachCard";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps } from "@/lib/analysis/tps";
import { buildPostSolveRows } from "@/lib/analysis/postSolveTable";
import { computeSessionStats, normalSolves } from "@/lib/stats/stats";
import { playSolveChime } from "@/lib/utils/sound";
import { EVENT_TAGS } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { findCase } from "@/lib/algorithms/caseLookup";
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

/** Cubeast-style running phase breakdown: finished phases show their time, the current one counts up live. */
function PhaseSplitsRow({
  durations,
  currentPhaseIndex,
  liveCurrentMs,
}: {
  durations: (number | null)[];
  currentPhaseIndex: number;
  liveCurrentMs: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PHASE_LABELS_4.map((label, i) => {
        const done = durations[i];
        const isCurrent = i === currentPhaseIndex;
        return (
          <span
            key={label}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums",
              isCurrent ? "bg-accent-soft text-accent" : done !== null ? "bg-bg-panel-2 text-muted" : "bg-bg-panel-2 text-muted-2",
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
  if (!ollCaseName && !pllCaseName) return null;
  const ollAlg = ollCaseName ? findCase("OLL", ollCaseName)?.alg : undefined;
  const pllAlg = pllCaseName ? findCase("PLL", pllCaseName)?.alg : undefined;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {ollCaseName && (
        <span className="flex flex-col items-center gap-0.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <span className="flex items-center gap-1">
            <Sparkles size={11} /> OLL: {ollCaseName}
          </span>
          {ollAlg && <span className="font-mono text-[10px] font-normal text-accent/70">{ollAlg}</span>}
        </span>
      )}
      {pllCaseName && (
        <span className="flex flex-col items-center gap-0.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <span className="flex items-center gap-1">
            <Sparkles size={11} /> PLL: {pllCaseName}
          </span>
          {pllAlg && <span className="font-mono text-[10px] font-normal text-accent/70">{pllAlg}</span>}
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
    moves,
    batterySupported,
    batteryLevel,
    gyroActive,
    protocolName,
    connect,
    disconnect,
    cancel,
    refreshBattery,
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
  const summarizeHeartRate = useHeartRateStore((s) => s.summarize);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const [saved, setSaved] = useState(false);
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
  const maxBucket = Math.max(1, peakTps(buckets));

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
  const [finishedScramble, setFinishedScramble] = useState("");
  // The gyro's read on the solve that just finished (regrips, oriented
  // reconstruction) — computed once at save time from the module-level gyro
  // log, which isn't reactive state, so it's captured here alongside the
  // scramble rather than re-derived on render.
  const [finishedGyro, setFinishedGyro] = useState<SolveGyroSummary | null>(null);
  // Where the cuber's eyes went during inspection (gyro cubes only): the
  // samples logged from arm() — the moment inspection began — to the first turn.
  const [finishedGaze, setFinishedGaze] = useState<{ report: GazeReport; facelets: string } | null>(null);

  // Saves the instant a solve finishes — no button, exactly like the
  // keyboard timer's own onComplete. Edge-triggered off solvedAtMs (a ref,
  // not state) so this fires exactly once per solve even though `finished`
  // keeps being true across re-renders until the next scramble is matched.
  const autoSavedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!finished || autoSavedAtRef.current === solvedAtMs) return;
    autoSavedAtRef.current = solvedAtMs;
    setFinishedScramble(scramble);
    const gyro = summarizeSolveGyro(
      getGyroLog(),
      useGyroStore.getState().ref,
      calibrationFor(protocolName).calibration,
      moves,
      startedAtMs!,
    );
    setFinishedGyro(gyro);
    const gyroLog = getGyroLog();
    const gazeRef = useGyroStore.getState().ref;
    const startFacelets = scrambleToFacelets(scramble);
    const gaze =
      gazeRef && gyroLog.length > 0
        ? analyzeGaze(gyroLog, gazeRef, calibrationFor(protocolName).calibration, gyroLog[0].atMs, startedAtMs!, startFacelets)
        : null;
    setFinishedGaze(gaze ? { report: gaze, facelets: startFacelets } : null);
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = summarizeHeartRate(startedAtMs!) ?? undefined;
    const splits = boundaries && boundaries.f2l !== null && boundaries.oll !== null
      ? [boundaries.cross!, boundaries.f2l, boundaries.oll]
      : undefined;
    void recordSolve(
      elapsedMs,
      scramble,
      splits,
      pendingEvent ?? undefined,
      reconstruction,
      heartRate,
      crossMs,
      moveTimestampsRel,
      gyro ? { rotations: gyro.rotations, orientedReconstruction: gyro.orientedReconstruction } : undefined,
      // Inspection ran from the moment the scramble matched to the first
      // turn: +2 past 15s, DNF past 17s — same rule as the keyboard timer.
      flow.inspectionStartedAtMs !== null ? inspectionPenalty(startedAtMs! - flow.inspectionStartedAtMs) : undefined,
    );
    if (soundEnabled) playSolveChime();
    setSaved(true);
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
  ]);

  const moveTokens = useMemo(() => moves.map((m) => m.token), [moves]);

  // Mistake Radar: a full move-by-move replay of the finished solve against
  // its scramble — only once it's finished and its scramble is pinned.
  const mistakeReport = useMemo(
    () =>
      finished && finishedScramble
        ? analyzeMistakes({
            scramble: finishedScramble,
            moves: moves.map((m) => m.token),
            timesMs: moveTimestampsRel,
            totalMs: elapsedMs,
          })
        : null,
    [finished, finishedScramble, moves, moveTimestampsRel, elapsedMs],
  );

  // Inspection Report Card: graded from how the cross came out.
  const inspection = useMemo(
    () => (finished && finishedScramble ? inspectionReport(finishedScramble, moveTokens, moveTimestampsRel) : null),
    [finished, finishedScramble, moveTokens, moveTimestampsRel],
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
    setSaved(false);
    autoSavedAtRef.current = null;
  };

  const mimicScramble = finished ? finishedScramble : scramble;

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
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <Bluetooth size={26} className="text-accent" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Connect your smart cube</h1>
        <p className="max-w-xs text-sm text-muted">
          A GAN, GiiKER, GoCube, QiYi, or MoYu (including MHC and the WCU-series AI cubes) times and records solves
          straight from your physical turns — no spacebar, and the reconstruction is captured automatically, case
          names and all.
        </p>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {connecting && <Loader2 size={14} className="animate-spin" />}
          {connecting ? "Connecting…" : "Connect smart cube"}
        </button>
        {error && <p className="max-w-xs text-xs text-danger">{error}</p>}
        <p className="max-w-xs text-[11px] text-muted-2">
          Your cube should be solved before you connect — that&apos;s what the app calibrates orientation from. Once
          connected, just scramble it: matching the target scramble starts inspection automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-4 py-2">
      <div className="flex items-center gap-1.5 text-xs text-success">
        <BluetoothConnected size={14} />
        {deviceName}
        {batterySupported && (
          <>
            <span className="text-border">·</span>
            <BatteryBadge level={batteryLevel} onRefresh={refreshBattery} />
          </>
        )}
        <Link href="/lab" className="ml-2 flex items-center gap-1 text-accent hover:underline">
          <FlaskConical size={12} /> Lab
        </Link>
        <button type="button" onClick={disconnect} className="ml-2 text-muted-2 underline hover:text-muted">
          Disconnect
        </button>
      </div>

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
          <p className="text-sm text-muted">{moves.length} moves so far — solve the cube to stop</p>
          <PhaseSplitsRow durations={durations} currentPhaseIndex={currentPhaseIndex} liveCurrentMs={liveCurrentMs} />
          {pacer.enabled && <PaceChip calls={pacer.calls} targets={pacer.targets} />}
          <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} />
        </div>
      )}

      {finished && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{moves.length} moves</span>
            {avgTps !== null && <span>{avgTps.toFixed(2)} TPS</span>}
            {saved && (
              <span className="flex items-center gap-1 text-success">
                <Check size={12} /> Saved
              </span>
            )}
          </div>

          <PostSolveTable rows={postSolveRows} scramble={finishedScramble} moves={moves} />

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
              <PostSolveCoachCard
                rows={postSolveRows}
                totalMs={elapsedMs}
                tps={avgTps}
                sessionMeanMs={coachSessionStats.mean}
                isNewPB={coachSessionStats.best !== null && elapsedMs <= coachSessionStats.best}
              />

              {buckets.length > 1 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Turn speed through the solve</p>
                  <div className="flex h-12 w-full items-end gap-0.5 rounded-lg bg-bg-panel-2 p-1.5">
                    {buckets.map((b, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-accent/70"
                        style={{ height: `${Math.max(6, (b.tps / maxBucket) * 100)}%` }}
                        title={`${b.tps.toFixed(1)} TPS`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {mistakeReport && <MistakeRadarCard report={mistakeReport} totalMs={elapsedMs} />}

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

              {finishedScramble && <XrayTeaser scramble={finishedScramble} moves={moveTokens} timesMs={moveTimestampsRel} />}
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
          <ScrambleGuidePanel />
          <p className="text-[11px] text-muted-2">Inspection starts automatically once it matches.</p>
          {cubeGesturesOn && <GestureHint />}
        </div>
      )}
    </div>
  );
}
