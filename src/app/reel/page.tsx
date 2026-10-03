"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Sparkles, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ReelPlayer } from "@/components/reel/ReelPlayer";
import { CanvasRecorder, themeAccent } from "@/components/reel/CanvasRecorder";
import { PERIOD_LABEL, buildMontage, montageSoundtrack, pickHighlights, type HighlightPeriod } from "@/lib/reel/highlights";
import { renderHighlightFrame } from "@/lib/reel/renderHighlights";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useFullSolve, useFullSolves } from "@/hooks/useFullSolve";
import { buildReelTimeline } from "@/lib/reel/timeline";
import { solveFinalMs } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * Solve Reel: turns any smart-cube solve into a shareable video — the real
 * cube state animated turn by turn at your actual pace (layers really
 * turning, the camera really swinging around for every mid-solve regrip a
 * gyro cube saw), with a running clock, phase banners naming your OLL and
 * PLL, split chips, a live move ticker and a TPS meter, ending on a solved
 * card. Rendered on a canvas and recorded straight to a video file in the
 * browser.
 */
function HighlightReel() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const [period, setPeriod] = useState<HighlightPeriod>("week");
  const [now] = useState(() => Date.now());
  const highlights = useMemo(() => pickHighlights(allSolves, { now, period, max: 5 }), [allSolves, now, period]);
  // The store's rows carry no gyro stream: the few picked solves' streams are read from the database,
  // and the montage waits for them so the camera work is the real thing, not a fallback.
  const { rows: stored, status } = useFullSolves(useMemo(() => highlights.map((h) => h.solve).filter((s) => s.hasGyro), [highlights]));
  const montage = useMemo(() => (highlights.length && status === "ready" ? buildMontage(highlights, stored) : null), [highlights, stored, status]);
  const soundtrack = useMemo(() => (montage ? montageSoundtrack(montage) : []), [montage]);
  const subtitle = PERIOD_LABEL[period];
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: number) => montage && renderHighlightFrame(ctx, montage, t, { accent: themeAccent(), title: "Highlights", subtitle }),
    [montage, subtitle],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center gap-1.5">
        {(["week", "month", "all"] as HighlightPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", period === p ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted")}
          >
            {p === "all" ? "All time" : p === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>
      {highlights.length > 0 && status !== "ready" ? (
        <div className="card rounded-xl p-6 text-center text-sm text-muted">
          {status === "loading" ? "Loading the solves\u2026" : "Couldn\u2019t read these solves from storage. Reload the page to try again."}
        </div>
      ) : !montage ? (
        <div className="card rounded-xl p-6 text-center text-sm text-muted">
          No smart-cube solves {subtitle === "all time" ? "yet" : subtitle} to film. Try a longer stretch, or solve on a connected cube.
        </div>
      ) : (
        <>
          <div className="card flex flex-col gap-1 rounded-xl p-3">
            <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
              The cut · {highlights.length} solve{highlights.length === 1 ? "" : "s"}, building to the fastest
            </p>
            {highlights.map((h, i) => (
              <div key={h.solve.id} className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-1.5 text-xs">
                <span className="w-4 text-muted-2">{i + 1}</span>
                <span className="flex-1 font-semibold text-foreground">{h.caption}</span>
                <span className="text-[10px] text-muted">{h.detail}</span>
                <span className="tabular-timer font-semibold text-foreground">{formatTime(h.finalMs)}</span>
              </div>
            ))}
          </div>
          <CanvasRecorder
            draw={draw}
            fromT={0}
            toT={montage.totalMs}
            posterT={900}
            soundtrack={soundtrack}
            title="Highlights"
            fileName={`highlights-${period}`}
            ariaLabel="Highlight reel preview"
          />
        </>
      )}
    </div>
  );
}

function SingleReel() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const candidates = useMemo(
    () =>
      allSolves
        .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
        .sort((a, b) => b.date - a.date),
    [allSolves],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected = candidates.find((s) => s.id === pickedId) ?? candidates[0] ?? null;
  // The stream is read from the database (the store's rows carry none); the reel waits for it.
  const { solve: stored, status } = useFullSolve(selected?.hasGyro ? selected : null);
  const timeline = useMemo(
    () =>
      selected && status === "ready"
        ? buildReelTimeline(
            selected.scramble,
            selected.reconstruction!.split(/\s+/).filter(Boolean),
            selected.moveTimestamps!,
            selected.timeMs,
            selected.rotations ?? [],
            stored?.gyroStream ?? null,
          )
        : null,
    [selected, stored, status],
  );

  return (
    <>
          {!selected ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on a connected smart cube and your solves show up here to film.</div>
          ) : (
            <>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {candidates.slice(0, 40).map((s) => {
                  const final = solveFinalMs(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPickedId(s.id)}
                      className={cn(
                        "flex shrink-0 flex-col items-start rounded-lg px-2.5 py-1.5 text-left",
                        s.id === selected.id ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-foreground",
                      )}
                    >
                      <span className="tabular-timer text-xs font-semibold">{final === null ? "DNF" : formatTime(final)}</span>
                      <span className={cn("text-[9px]", s.id === selected.id ? "text-accent-fg/80" : "text-muted-2")}>
                        {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!timeline ? (
                <div className="card rounded-xl p-6 text-center text-sm text-muted">
                  {status === "failed" ? "Couldn\u2019t read this solve from storage. Reload the page to try again." : "Loading the solve\u2026"}
                </div>
              ) : (
                <ReelPlayer
                  timeline={timeline}
                  title="Solve Reel"
                  subtitle={new Date(selected.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  fileName={`solve-${formatTime(selected.timeMs).replace(/[:.]/g, "-")}`}
                />
              )}
            </>
          )}
    </>
  );
}

export default function ReelPage() {
  const [tab, setTab] = useState<"single" | "highlights">("single");
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
              <Clapperboard size={17} className="text-accent" /> Solve Reel
            </h1>
            <p className="text-[11px] text-muted-2">
              Turn smart-cube solves into video — one solve, or an auto-cut highlight reel of your best, with a soundtrack played off your
              actual turns.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1">
            {(
              [
                ["single", "One solve", Clapperboard],
                ["highlights", "Highlights", Sparkles],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold",
                  tab === id ? "bg-accent text-accent-fg" : "text-muted",
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          {tab === "single" ? <SingleReel /> : <HighlightReel />}
        </div>
      </div>
    </>
  );
}
