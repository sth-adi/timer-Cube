"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ReelPlayer } from "@/components/reel/ReelPlayer";
import { useSessionStore } from "@/lib/store/sessionStore";
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
export default function ReelPage() {
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
  const timeline = useMemo(
    () =>
      selected
        ? buildReelTimeline(
            selected.scramble,
            selected.reconstruction!.split(/\s+/).filter(Boolean),
            selected.moveTimestamps!,
            selected.timeMs,
            selected.rotations ?? [],
          )
        : null,
    [selected],
  );

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
            <p className="text-[11px] text-muted-2">Turn any smart-cube solve into a video — real turns, real regrips, real pace, splits and cases on screen.</p>
          </div>

          {!selected || !timeline ? (
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
              <ReelPlayer
                timeline={timeline}
                title="Solve Reel"
                subtitle={new Date(selected.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                fileName={`solve-${formatTime(selected.timeMs).replace(/[:.]/g, "-")}`}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
