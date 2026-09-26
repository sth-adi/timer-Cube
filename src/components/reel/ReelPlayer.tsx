"use client";

import { useCallback, useMemo } from "react";
import { INTRO_MS, OUTRO_MS, renderReelFrame } from "@/lib/reel/renderFrame";
import { reelSoundtrack } from "@/lib/reel/highlights";
import type { ReelTimeline } from "@/lib/reel/timeline";
import { CanvasRecorder, themeAccent } from "./CanvasRecorder";

interface ReelPlayerProps {
  timeline: ReelTimeline;
  title: string;
  subtitle: string;
  fileName: string;
  pb?: boolean;
}

/** A single-solve Solve Reel: plays on a canvas and records to a video file, soundtrack included. */
export function ReelPlayer({ timeline, title, subtitle, fileName, pb = false }: ReelPlayerProps) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: number) => renderReelFrame(ctx, timeline, t, { accent: themeAccent(), title, subtitle }),
    [timeline, title, subtitle],
  );
  const soundtrack = useMemo(() => reelSoundtrack(timeline, INTRO_MS, pb), [timeline, pb]);
  return (
    <CanvasRecorder
      draw={draw}
      fromT={-INTRO_MS}
      toT={timeline.totalMs + OUTRO_MS}
      posterT={-1}
      soundtrack={soundtrack}
      title={title}
      fileName={fileName}
      ariaLabel="Solve reel preview"
    />
  );
}
