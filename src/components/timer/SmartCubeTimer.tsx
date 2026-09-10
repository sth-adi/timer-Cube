"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bluetooth, BluetoothConnected, Check, Loader2, Radio, Sparkles, Wand2, Zap } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useSmartCubeFlow } from "@/hooks/useSmartCubeFlow";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps } from "@/lib/analysis/tps";
import { EVENT_TAGS } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {ollCaseName && (
        <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <Sparkles size={11} /> OLL: {ollCaseName}
        </span>
      )}
      {pllCaseName && (
        <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <Sparkles size={11} /> PLL: {pllCaseName}
        </span>
      )}
    </div>
  );
}

/**
 * Timing driven by a real Bluetooth smart cube instead of the keyboard:
 * scramble it, and this verifies the physical state against the target
 * scramble live — matching it starts inspection automatically, and pausing
 * mid-scramble with the wrong state offers the exact moves to fix it (see
 * useSmartCubeFlow). Once inspection ends, your first physical turn starts
 * the clock, and the moment the cube itself reports solved, the clock
 * stops — no spacebar, and the exact moves you made become a verified
 * reconstruction automatically, ready for the analyzer without retyping a
 * single move.
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
    ollAtMs,
    ollCaseName,
    pllCaseName,
    moves,
    connect,
    disconnect,
    cancel,
  } = useSmartCubeStore();
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const summarizeHeartRate = useHeartRateStore((s) => s.summarize);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const [saved, setSaved] = useState(false);

  // Auto-verifies the physical scramble against `scramble` and hands off to
  // inspection the instant it matches — see the hook for the full state
  // machine. Only meaningful before `arm()` has been called; once armed,
  // the existing recording/solved-detection below takes over.
  const flow = useSmartCubeFlow(scramble);

  const finished = !armed && !recording && solvedAtMs !== null && startedAtMs !== null;
  const lastMoveMs = moves[moves.length - 1]?.timeStampMs ?? startedAtMs ?? 0;
  const elapsedMs = recording ? lastMoveMs - (startedAtMs ?? 0) : finished ? solvedAtMs! - startedAtMs! : 0;

  const timestamps = useMemo(() => moves.map((m) => m.timeStampMs), [moves]);
  const buckets = useMemo(() => computeTpsBuckets(timestamps), [timestamps]);
  const avgTps = useMemo(() => averageTps(timestamps), [timestamps]);
  const maxBucket = Math.max(1, peakTps(buckets));

  // Cross/F2L/OLL/PLL boundaries, detected live off the cube's own state as
  // it happens (see smartCubeStore) — always available the instant each
  // phase completes, no post-solve analysis pass to wait on.
  const boundaries: PhaseBoundaries | null =
    startedAtMs !== null
      ? {
          cross: crossAtMs !== null ? crossAtMs - startedAtMs : null,
          f2l: f2lAtMs !== null ? f2lAtMs - startedAtMs : null,
          oll: ollAtMs !== null ? ollAtMs - startedAtMs : null,
          pll: finished ? elapsedMs : null,
        }
      : null;
  const durations = boundaries ? phaseDurations(boundaries) : [null, null, null, null];
  const currentPhaseIndex = durations.findIndex((d) => d === null);
  const priorBoundaryMs =
    boundaries && currentPhaseIndex > 0 ? ([boundaries.cross, boundaries.f2l, boundaries.oll][currentPhaseIndex - 1] ?? 0) : 0;
  const liveCurrentMs = recording && currentPhaseIndex >= 0 ? elapsedMs - priorBoundaryMs : null;
  const crossMs = crossAtMs !== null && startedAtMs !== null ? crossAtMs - startedAtMs : undefined;

  const onSave = () => {
    if (!finished) return;
    const reconstruction = moves.map((m) => m.token).join(" ");
    const moveTimestamps = moves.map((m) => m.timeStampMs - startedAtMs!);
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = summarizeHeartRate(startedAtMs!) ?? undefined;
    const splits = boundaries && boundaries.f2l !== null && boundaries.oll !== null
      ? [boundaries.cross!, boundaries.f2l, boundaries.oll]
      : undefined;
    void recordSolve(elapsedMs, scramble, splits, pendingEvent ?? undefined, reconstruction, heartRate, crossMs, moveTimestamps);
    setSaved(true);
  };

  const onAnalyze = () => {
    const reconstruction = moves.map((m) => m.token).join(" ");
    const moveTimestamps = moves.map((m) => m.timeStampMs - startedAtMs!);
    requestAnalysis(scramble, elapsedMs, undefined, reconstruction, moveTimestamps);
  };

  const onNext = () => {
    cancel();
    setSaved(false);
    void nextScramble();
  };

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
        <Bluetooth size={28} className="text-accent" />
        <p className="max-w-xs text-sm text-muted">
          Connect a GAN, GiiKER, GoCube, QiYi, or MoYu (including MHC and the WCU-series AI cubes) smart cube to
          time and record solves straight from your physical turns — no spacebar, and the reconstruction is
          captured automatically.
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
          {Math.ceil(flow.inspectionRemainingMs / 1000)}
        </p>
      ) : (
        (armed || recording || finished) && (
          <p className="tabular-timer text-center text-6xl font-bold">{formatTime(elapsedMs)}</p>
        )
      )}

      {(armed || recording || finished) && (
        <div className="card h-40 w-full max-w-[13rem] overflow-hidden rounded-xl">
          <LiveCubeMimic scramble={scramble} moves={moves} className="h-full w-full" />
        </div>
      )}

      {armed && !recording && flow.phase !== "inspecting" && (
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <Radio size={14} className="animate-pulse" /> Waiting for your first move…
        </p>
      )}
      {armed && !recording && flow.phase === "inspecting" && (
        <p className="text-xs text-muted-2">Scramble verified — start solving any time, inspection is just the max.</p>
      )}
      {recording && (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm text-muted">{moves.length} moves so far — solve the cube to stop</p>
          <PhaseSplitsRow durations={durations} currentPhaseIndex={currentPhaseIndex} liveCurrentMs={liveCurrentMs} />
          <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} />
        </div>
      )}

      {!armed && !recording && !finished && flow.phase === "scrambling" && (
        <div className="flex w-full flex-col items-center gap-3">
          {scramble && (
            <div className="w-full max-w-[13rem]">
              <ScrambleNet scramble={scramble} className="w-full" />
            </div>
          )}
          <p className="tabular-timer break-words text-center text-xs leading-relaxed text-muted-2">{scramble}</p>
          {flow.correction && flow.correction.length > 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg bg-warning/10 px-3 py-2 text-center">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <AlertTriangle size={13} /> Off track — do this next
              </p>
              <p className="tabular-timer font-mono text-sm font-medium text-foreground">{flow.correction.join(" ")}</p>
            </div>
          ) : flow.correcting ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-2">
              <Loader2 size={12} className="animate-spin" /> Checking your scramble…
            </p>
          ) : (
            <p className="text-xs text-muted-2">Scramble your cube to this pattern — inspection starts automatically.</p>
          )}
        </div>
      )}
      {finished && (
        <>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>{moves.length} moves</span>
            {avgTps !== null && <span>{avgTps.toFixed(2)} avg TPS</span>}
          </div>

          <PhaseSplitsRow durations={durations} currentPhaseIndex={currentPhaseIndex} liveCurrentMs={liveCurrentMs} />
          <CaseBadges ollCaseName={ollCaseName} pllCaseName={pllCaseName} />

          {buckets.length > 1 && (
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
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saved}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold",
                saved ? "bg-success/15 text-success" : "bg-accent text-accent-fg",
              )}
            >
              {saved ? <Check size={14} /> : <Zap size={14} />}
              {saved ? "Saved" : "Save solve"}
            </button>
            <button
              type="button"
              onClick={onAnalyze}
              className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground"
            >
              <Wand2 size={14} /> Full 3D analysis
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-bg-panel-2 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground"
            >
              Next scramble
            </button>
          </div>
        </>
      )}
    </div>
  );
}
