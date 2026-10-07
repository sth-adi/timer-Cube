"use client";

import { useEffect, useState } from "react";
import { absorbTargetChange, criticallyDampedStep, SMOOTH_OMEGA, SPRING_REST, smoothedValue, type SpringState } from "./smoothing";
import { motionIsOff } from "./motionOff";

export interface SmoothedValueOptions {
  /** Stiffness of the ease (rad/s). Higher is snappier; the default settles in about a quarter of a second. */
  omega?: number;
  /**
   * The biggest per-render change of the target that is still drawn exactly (a value tracking the
   * clock). Anything bigger is a jump and is eased. 0 eases every change.
   */
  jumpAbove?: number;
  /** The range the indicator can show; the drawn value never leaves it. */
  min?: number;
  max?: number;
}

/**
 * `target`, eased: the value to draw for an indicator so a jump in `target` glides rather than steps.
 * Frame-rate independent (closed-form critically damped spring), costs no frames once settled, and
 * returns `target` untouched when motion is off (reduced motion, FX "off").
 *
 * Only for indicators around the clock (bars, rings, a rate readout). The clock's own digits must be
 * drawn from the true elapsed time, never from this.
 */
export function useSmoothedValue(target: number, opts: SmoothedValueOptions = {}): number {
  const { omega = SMOOTH_OMEGA, jumpAbove = 0, min, max } = opts;
  const off = motionIsOff();
  const [prevTarget, setPrevTarget] = useState(target);
  const [spring, setSpring] = useState<SpringState>(SPRING_REST);

  // Derived from the new target during render (not in an effect), so a jump never paints a frame at its far end.
  if (prevTarget !== target) {
    setPrevTarget(target);
    if (!off) {
      const next = absorbTargetChange(spring, prevTarget, target, jumpAbove);
      if (next !== spring) setSpring(next);
    }
  }

  const easing = !off && (spring.e !== 0 || spring.v !== 0);
  useEffect(() => {
    if (!easing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setSpring((s) => criticallyDampedStep(s, dt, omega));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [easing, omega]);

  return off ? target : smoothedValue(target, spring, min, max);
}
