"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gift, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { CanvasRecorder, themeAccent } from "@/components/reel/CanvasRecorder";
import { useSessionStore } from "@/lib/store/sessionStore";
import { SLIDE_MS, buildWrapped, wrappedSlides, type WrappedPeriod } from "@/lib/wrapped/wrapped";
import { renderWrappedFrame } from "@/lib/wrapped/renderWrapped";
import type { SoundCue } from "@/lib/reel/highlights";
import { cn } from "@/lib/utils/cn";

/**
 * Cube Wrapped: your month or year of cubing as a story — tap through it,
 * or record it as a video with a soundtrack, ready to share.
 */
export default function WrappedPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const [period, setPeriod] = useState<WrappedPeriod>("month");
  const [nowTs] = useState(() => Date.now());

  // Every period (going back) that has enough solves for a story.
  const options = useMemo(() => {
    const out: { at: number; label: string }[] = [];
    for (let k = 0; k < (period === "month" ? 24 : 5); k++) {
      const d = new Date(nowTs);
      const at = period === "month" ? new Date(d.getFullYear(), d.getMonth() - k, 15).getTime() : new Date(d.getFullYear() - k, 6, 1).getTime();
      const w = buildWrapped(allSolves, at, period);
      if (w) out.push({ at, label: w.label });
    }
    return out;
  }, [allSolves, period, nowTs]);
  const [pickedAt, setPickedAt] = useState<number | null>(null);
  const at = options.find((o) => o.at === pickedAt)?.at ?? options[0]?.at ?? null;
  const data = useMemo(() => (at === null ? null : buildWrapped(allSolves, at, period)), [allSolves, at, period]);
  const slides = useMemo(() => (data ? wrappedSlides(data) : []), [data]);
  const [slide, setSlide] = useState(0);
  const current = Math.min(slide, Math.max(0, slides.length - 1));

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number) => renderWrappedFrame(ctx, slides, t, themeAccent()), [slides]);
  const soundtrack = useMemo<SoundCue[]>(() => {
    const cues: SoundCue[] = [];
    const total = slides.length * SLIDE_MS;
    for (let t = 0; t < total; t += 500) cues.push({ atMs: t, kind: "beat" });
    slides.forEach((s, i) => cues.push({ atMs: i * SLIDE_MS, kind: s.kicker === "Your best single" ? "pb" : "card" }));
    return cues.sort((a, b) => a.atMs - b.atMs);
  }, [slides]);

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
              <Gift size={17} className="text-accent" /> Cube Wrapped
            </h1>
            <p className="text-[11px] text-muted-2">Your month or year of cubing, as a story you can share.</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1">
            {(["month", "year"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPeriod(p);
                  setPickedAt(null);
                  setSlide(0);
                }}
                className={cn("rounded-full py-1.5 text-xs font-semibold", period === p ? "bg-accent text-accent-fg" : "text-muted")}
              >
                {p === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>
          {options.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {options.map((o) => (
                <button
                  key={o.at}
                  type="button"
                  onClick={() => {
                    setPickedAt(o.at);
                    setSlide(0);
                  }}
                  className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-medium", o.at === at ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {!data ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">A few more solves this {period} and your Wrapped is ready.</div>
          ) : (
            <>
              <CanvasRecorder
                draw={draw}
                fromT={0}
                toT={slides.length * SLIDE_MS}
                posterT={current * SLIDE_MS + 2400}
                soundtrack={soundtrack}
                title={`Cube Wrapped · ${data.label}`}
                fileName={`cube-wrapped-${data.label.replace(/\s+/g, "-").toLowerCase()}`}
                ariaLabel="Cube Wrapped story"
              />
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={current === 0} className="rounded-full bg-bg-panel-2 p-2 text-foreground disabled:opacity-30" aria-label="Previous card">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[11px] tabular-nums text-muted">
                  {current + 1} / {slides.length}
                </span>
                <button type="button" onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))} disabled={current === slides.length - 1} className="rounded-full bg-bg-panel-2 p-2 text-foreground disabled:opacity-30" aria-label="Next card">
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
