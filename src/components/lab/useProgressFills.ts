"use client";

import { useMemo, useState } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { NO_PROGRESS, advanceProgress, pendingStickers } from "@/lib/smartcube/cubeProgress";
import { progressFills } from "@/lib/smartcube/progressFill";

/** Below this cube size (px) the dimming is not drawn: the compact twin is too small to read it. */
export const PROGRESS_MIN_SIZE = 60;

/**
 * `stickerFills` for TurnCube that mark which pieces of the current stage are still to be put right (see
 * lib/smartcube/cubeProgress): the cube shows the facelets it is drawing, and the ones not yet home are
 * a little dimmed and desaturated, so it fills in as the cross, each F2L pair, OLL and PLL land. Only while
 * `live`, only for a cube of at least PROGRESS_MIN_SIZE px, and never with effects off. The returned array
 * keeps its identity while the picture is unchanged; undefined when nothing is to be marked.
 */
export function useProgressFills(facelets: string, live: boolean, size: number): readonly (string | undefined)[] | undefined {
  const fxOff = useSettingsStore((s) => s.fxLevel === "off");
  const on = live && !fxOff && size >= PROGRESS_MIN_SIZE;
  const [progress, setProgress] = useState(NO_PROGRESS);
  // Derived during render: the stage only moves forward while on, and is forgotten the moment it is not.
  const next = on ? advanceProgress(progress, facelets) : NO_PROGRESS;
  if (next !== progress) setProgress(next);
  return useMemo(() => {
    if (!on) return undefined;
    const pending = pendingStickers(next, facelets);
    return pending ? progressFills(facelets, pending) : undefined;
  }, [on, next, facelets]);
}
