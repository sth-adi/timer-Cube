"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Gauge, Timer as TimerIcon, Volume2 } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { usePersonalShape } from "@/hooks/useSplitPacer";
import { usePacerStore } from "@/lib/store/pacerStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MILESTONES, MIN_HISTORY, milestoneTimes, paceVerdict, targetSplits } from "@/lib/pacer/pacer";
import { playPaceTone } from "@/lib/utils/sound";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const STRETCH_COLORS = ["#e6e6ea", "#35e6c5", "#2fb8a0", "#238a78", "#1a6457", "#ffb020", "#7c5cff"];

/**
 * Split Pacer: set a target time, and every smart-cube solve calls your
 * pace out loud at each milestone — cross, every pair, OLL, finish — with
 * target splits learned from how you actually solve.
 */
export default function PacerPage() {
  const enabled = usePacerStore((s) => s.enabled);
  const setEnabled = usePacerStore((s) => s.setEnabled);
  const targetMs = usePacerStore((s) => s.targetMs);
  const setTargetMs = usePacerStore((s) => s.setTargetMs);
  const allSolves = useSessionStore((s) => s.allSolves);
  const { shape, personal, solves } = usePersonalShape();
  const targets = useMemo(() => targetSplits(targetMs, shape), [targetMs, shape]);

  const recent = useMemo(
    () =>
      allSolves
        .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
        .sort((a, b) => b.date - a.date)
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          timeMs: s.timeMs,
          marks: milestoneTimes({ scramble: s.scramble, moves: s.reconstruction!.split(/\s+/).filter(Boolean), timesMs: s.moveTimestamps! }),
        })),
    [allSolves],
  );
  const avgMs = recent.length ? recent.reduce((a, r) => a + r.timeMs, 0) / recent.length : null;
  const bestMs = recent.length ? Math.min(...recent.map((r) => r.timeMs)) : null;
  const round = (ms: number) => Math.round(ms / 250) * 250;
  const SHOWN = [0, 4, 5, 6];

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Gauge size={17} className="text-accent" /> Split Pacer
            </h1>
            <p className="text-[11px] text-muted-2">A tone at every milestone of every smart-cube solve: ahead, on pace, or behind your target split.</p>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Call my pace during solves</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={cn("relative h-6 w-11 rounded-full transition-colors", enabled ? "bg-accent" : "bg-bg-panel-2")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", enabled ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-muted">Target time</span>
                <span className="tabular-timer text-2xl font-bold text-foreground">{formatTime(targetMs)}</span>
              </div>
              <input
                type="range"
                min={4000}
                max={60000}
                step={250}
                value={targetMs}
                onChange={(e) => setTargetMs(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
                aria-label="Target time"
              />
              {avgMs !== null && bestMs !== null && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["Recent average", round(avgMs)],
                    ["10% faster", round(avgMs * 0.9)],
                    ["Recent best", round(bestMs)],
                  ].map(([label, ms]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTargetMs(ms as number)}
                      className="rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground"
                    >
                      {label} · {formatTime(ms as number)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Your target splits</p>
            <div className="flex h-4 overflow-hidden rounded-full">
              {targets.map((t, k) => (
                <span key={k} title={MILESTONES[k]} style={{ flexGrow: Math.max(1, t - (k ? targets[k - 1] : 0)), background: STRETCH_COLORS[k] }} />
              ))}
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[11px]">
              <span className="text-muted-2">Milestone</span>
              <span className="text-right text-muted-2">by</span>
              <span className="text-right text-muted-2">stretch</span>
              {MILESTONES.map((m, k) => (
                <div key={m} className="contents">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: STRETCH_COLORS[k] }} />
                    {m}
                  </span>
                  <span className="text-right font-semibold tabular-nums text-foreground">{formatTime(targets[k])}</span>
                  <span className="text-right tabular-nums text-muted">{formatTime(targets[k] - (k ? targets[k - 1] : 0))}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-2">
              {personal
                ? `Shaped like your own solves — learned from your last ${solves} complete smart-cube solves, scaled to the target.`
                : `A typical CFOP shape for now; after ${MIN_HISTORY} complete smart-cube solves (you have ${solves}) it switches to your own.`}
            </p>
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
              <Volume2 size={12} /> What you&apos;ll hear
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["ahead", "Ahead", "rising"],
                  ["on", "On pace", "one note"],
                  ["behind", "Behind", "falling"],
                ] as const
              ).map(([v, label, blurb]) => (
                <button key={v} type="button" onClick={() => playPaceTone(v)} className="flex flex-col items-center rounded-lg bg-bg-panel-2 py-2">
                  <span className={cn("text-xs font-semibold", v === "ahead" ? "text-success" : v === "behind" ? "text-danger" : "text-accent")}>{label}</span>
                  <span className="text-[10px] text-muted-2">{blurb} · tap</span>
                </button>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <div className="card flex flex-col gap-2 rounded-xl p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Your last {recent.length} solves against this target</p>
              <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-x-2 gap-y-1 text-[11px]">
                <span />
                {SHOWN.map((k) => (
                  <span key={k} className="text-center text-muted-2">
                    {MILESTONES[k]}
                  </span>
                ))}
                {recent.map((r) => (
                  <div key={r.id} className="contents">
                    <span className="tabular-nums text-muted">{formatTime(r.timeMs)}</span>
                    {SHOWN.map((k) => {
                      const t = r.marks[k];
                      if (t === null) return <span key={k} className="text-center text-muted-2">—</span>;
                      const d = t - targets[k];
                      const v = paceVerdict(d);
                      return (
                        <span
                          key={k}
                          className={cn(
                            "rounded text-center font-semibold tabular-nums",
                            v === "ahead" ? "bg-success/15 text-success" : v === "behind" ? "bg-danger/15 text-danger" : "bg-accent-soft text-accent",
                          )}
                        >
                          {d < 0 ? "−" : "+"}
                          {(Math.abs(d) / 1000).toFixed(1)}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
