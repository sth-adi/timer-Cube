"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { analyzeSmartCubeSolve, type SmartCubeAnalytics } from "@/lib/analysis/smartCubeAnalytics";
import { EVENT_TAGS } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { cn } from "@/lib/utils/cn";

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
  const [analytics, setAnalytics] = useState<SmartCubeAnalytics | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Auto-verifies the physical scramble against `scramble` and hands off to
  // inspection the instant it matches — see the hook for the full state
  // machine. Only meaningful before `arm()` has been called; once armed,
  // the existing recording/solved-detection below takes over.
  const flow = useSmartCubeFlow(scramble);

  const finished = !armed && !recording && solvedAtMs !== null && startedAtMs !== null;
  const elapsedMs = recording
    ? (moves[moves.length - 1]?.timeStampMs ?? startedAtMs ?? 0) - (startedAtMs ?? 0)
    : finished
      ? solvedAtMs! - startedAtMs!
      : 0;

  const timestamps = useMemo(() => moves.map((m) => m.timeStampMs), [moves]);
  const buckets = useMemo(() => computeTpsBuckets(timestamps), [timestamps]);
  const avgTps = useMemo(() => averageTps(timestamps), [timestamps]);
  const maxBucket = Math.max(1, peakTps(buckets));

  const crossMs = crossAtMs !== null && startedAtMs !== null ? crossAtMs - startedAtMs : undefined;

  // The instant a solve finishes, run its captured reconstruction through
  // the same analyzer pipeline the manual analyzer uses — cases ran into,
  // real Cross/F2L/OLL/PLL splits, all of it, without asking the cuber to
  // retype a single move. Edge-triggered off solvedAtMs so this fires once
  // per solve, not on every render while "finished" holds.
  const analyzedSolvedAtRef = useRef<number | null>(null);
  const analysisRequestIdRef = useRef(0);
  useEffect(() => {
    if (!finished || analyzedSolvedAtRef.current === solvedAtMs) return;
    analyzedSolvedAtRef.current = solvedAtMs;
    const requestId = ++analysisRequestIdRef.current;
    setAnalyzing(true);
    const snapshotMoves = moves;
    const snapshotScramble = scramble;
    const snapshotStart = startedAtMs!;
    void analyzeSmartCubeSolve(snapshotScramble, snapshotMoves, snapshotStart)
      .then((result) => {
        if (analysisRequestIdRef.current !== requestId) return; // superseded by a later solve
        setAnalytics(result);
      })
      .catch(() => {
        if (analysisRequestIdRef.current !== requestId) return;
        setAnalytics(null);
      })
      .finally(() => {
        if (analysisRequestIdRef.current !== requestId) return;
        setAnalyzing(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, solvedAtMs]);

  const onSave = () => {
    if (!finished) return;
    const reconstruction = moves.map((m) => m.token).join(" ");
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = summarizeHeartRate(startedAtMs!) ?? undefined;
    void recordSolve(elapsedMs, scramble, analytics?.splits, pendingEvent ?? undefined, reconstruction, heartRate, crossMs);
    setSaved(true);
  };

  const onAnalyze = () => {
    const reconstruction = moves.map((m) => m.token).join(" ");
    requestAnalysis(scramble, elapsedMs, undefined, reconstruction);
  };

  const onNext = () => {
    cancel();
    setSaved(false);
    setAnalytics(null);
    setAnalyzing(false);
    analyzedSolvedAtRef.current = null;
    analysisRequestIdRef.current++;
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
      {recording && <p className="text-sm text-muted">{moves.length} moves so far — solve the cube to stop</p>}

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
            {crossMs !== undefined && <span>cross {formatTime(crossMs)}</span>}
          </div>

          {analyzing && (
            <p className="flex items-center gap-1.5 text-xs text-muted-2">
              <Loader2 size={12} className="animate-spin" /> Reading your solution — cases, splits, the works…
            </p>
          )}

          {analytics && (analytics.ollCaseName || analytics.pllCaseName || analytics.splits) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {analytics.splits && (
                <span className="rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                  Cross {formatTime(analytics.splits[0])} · F2L {formatTime(analytics.splits[1] - analytics.splits[0])} ·
                  OLL {formatTime(analytics.splits[2] - analytics.splits[1])} · PLL {formatTime(elapsedMs - analytics.splits[2])}
                </span>
              )}
              {analytics.ollCaseName && (
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                  <Sparkles size={11} /> OLL: {analytics.ollCaseName}
                </span>
              )}
              {analytics.pllCaseName && (
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                  <Sparkles size={11} /> PLL: {analytics.pllCaseName}
                </span>
              )}
            </div>
          )}

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
