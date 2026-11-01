"use client";

import { useCallback, useMemo, useState } from "react";
import { INTRO_MS, OUTRO_MS, renderReelFrame } from "@/lib/reel/renderFrame";
import { reelSoundtrack } from "@/lib/reel/highlights";
import { fromReelMs, rampFor, toReelMs, warpCues } from "@/lib/reel/juice";
import type { ReelTimeline } from "@/lib/reel/timeline";
import { CanvasRecorder } from "./CanvasRecorder";
import { useReelTheme } from "./useReelTheme";

interface ReelPlayerProps {
  timeline: ReelTimeline;
  title: string;
  subtitle: string;
  fileName: string;
  pb?: boolean;
  /** Small watermark at the foot of the card — a username, or the app's name. */
  credit?: string;
  /** Slow the last few moves into the finish. Default on; `?ramp=0` on the page turns it off (needed for the split-screen export, whose camera footage runs at real speed). */
  ramp?: boolean;
}

/** `?ramp=0` in the page URL opts out of the finish slow-mo. */
function rampAllowed(): boolean {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("ramp") !== "0";
}

/** A single-solve Solve Reel: plays on a canvas and records to a video file, soundtrack included. */
export function ReelPlayer({ timeline, title, subtitle, fileName, pb = false, credit = "Cube", ramp = true }: ReelPlayerProps) {
  const theme = useReelTheme();
  const [urlAllowsRamp] = useState(rampAllowed);
  const slow = useMemo(() => (ramp && urlAllowsRamp ? rampFor(timeline) : null), [timeline, ramp, urlAllowsRamp]);
  const style = useMemo(() => ({ ...theme, title, subtitle, credit, pb }), [theme, title, subtitle, credit, pb]);
  // The recorder's clock `r` is the video's; the solve is drawn at the solve time it maps to (slowed over the ramp).
  const draw = useCallback((ctx: CanvasRenderingContext2D, r: number) => renderReelFrame(ctx, timeline, fromReelMs(slow, r, timeline.totalMs), style), [timeline, style, slow]);
  const soundtrack = useMemo(() => warpCues(reelSoundtrack(timeline, INTRO_MS, pb), INTRO_MS, slow), [timeline, pb, slow]);
  return (
    <CanvasRecorder
      draw={draw}
      fromT={-INTRO_MS}
      toT={toReelMs(slow, timeline.totalMs) + OUTRO_MS}
      posterT={-1}
      soundtrack={soundtrack}
      title={title}
      fileName={fileName}
      ariaLabel="Solve reel preview"
    />
  );
}
