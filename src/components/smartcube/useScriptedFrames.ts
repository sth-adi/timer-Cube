"use client";

import { useEffect, useState } from "react";
import { motionIsOff } from "@/components/motion/motionOff";

export interface ScriptedFramesOptions {
  /** Start over after the last frame (frames should then close on the first, so nothing jumps). */
  loop?: boolean;
  /** Time between frames. */
  stepMs?: number;
  /** Wait before the first step. */
  startDelayMs?: number;
  /** Rest this long after every `pauseEvery` frames (0 for never), so a loop breathes between repeats. */
  pauseEvery?: number;
  pauseMs?: number;
}

/**
 * Steps through a list of cube states on a timer, for a cube that plays a short scripted sequence (the
 * connection moment). Feed the result to useTurnAnimation so each step plays as a layer turning. It
 * renders the first frame, and the timers only ever move it forward: under reduced motion or the flat
 * FX level the first tick jumps straight to where the sequence ends (the first frame again for a loop),
 * so nothing animates. Keep `frames` stable between renders.
 */
export function useScriptedFrames(frames: readonly string[], { loop = false, stepMs = 380, startDelayMs = 0, pauseEvery = 0, pauseMs = 0 }: ScriptedFramesOptions = {}): string {
  const [index, setIndex] = useState(0);
  const last = frames.length - 1;
  useEffect(() => {
    if (!loop && index >= last) return undefined;
    const delay = index === 0 ? startDelayMs : pauseEvery > 0 && index % pauseEvery === 0 ? pauseMs : stepMs;
    const timer = setTimeout(() => {
      if (motionIsOff()) setIndex(loop ? 0 : last);
      else setIndex(index >= last ? 0 : index + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [index, last, loop, stepMs, startDelayMs, pauseEvery, pauseMs]);
  return frames[Math.min(index, last)] ?? "";
}
