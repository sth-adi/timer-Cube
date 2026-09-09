"use client";

import { useMemo, useState } from "react";
import { Bluetooth, BluetoothConnected, Check, Loader2, Radio, Zap } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps } from "@/lib/analysis/tps";
import { EVENT_TAGS } from "@/types";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { cn } from "@/lib/utils/cn";

/**
 * Timing driven by a real Bluetooth smart cube instead of the keyboard: arm
 * it, make your first physical turn to start the clock, and the moment the
 * cube itself reports solved, the clock stops — no spacebar, and the exact
 * moves you made become a verified reconstruction automatically, ready for
 * the analyzer without retyping a single move.
 *
 * Needs a real smart cube (GAN / GiiKER / GoCube) and a browser with Web
 * Bluetooth (Chromium-based, HTTPS or localhost) — there's no software
 * fallback for the hardware half of this.
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
    moves,
    connect,
    disconnect,
    arm,
    cancel,
  } = useSmartCubeStore();
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const summarizeHeartRate = useHeartRateStore((s) => s.summarize);
  const [saved, setSaved] = useState(false);

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

  const onSave = () => {
    if (!finished) return;
    const reconstruction = moves.map((m) => m.token).join(" ");
    // Unlike the keyboard timer, a smart-cube solve has a real absolute
    // start time straight from the cube's own event stream, so heart-rate
    // samples are matched against it directly rather than reconstructed.
    const heartRate = summarizeHeartRate(startedAtMs!) ?? undefined;
    void recordSolve(elapsedMs, scramble, undefined, pendingEvent ?? undefined, reconstruction, heartRate);
    setSaved(true);
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
          Connect a GAN, GiiKER, or GoCube smart cube to time and record solves straight from your physical
          turns — no spacebar, and the reconstruction is captured automatically.
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
          Your cube should be solved before you connect — that&apos;s what the app calibrates orientation from.
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

      <p className="tabular-timer text-center text-6xl font-bold">{formatTime(elapsedMs)}</p>

      {armed && !recording && (
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <Radio size={14} className="animate-pulse" /> Waiting for your first move…
        </p>
      )}
      {recording && <p className="text-sm text-muted">{moves.length} moves so far — solve the cube to stop</p>}

      {finished && (
        <>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>{moves.length} moves</span>
            {avgTps !== null && <span>{avgTps.toFixed(2)} avg TPS</span>}
          </div>

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

          <div className="flex gap-2">
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
              onClick={onNext}
              className="rounded-full bg-bg-panel-2 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground"
            >
              Next scramble
            </button>
          </div>
        </>
      )}

      {!armed && !recording && !finished && (
        <button
          type="button"
          onClick={arm}
          className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-fg"
        >
          <Radio size={14} />
          Ready to solve
        </button>
      )}
    </div>
  );
}
