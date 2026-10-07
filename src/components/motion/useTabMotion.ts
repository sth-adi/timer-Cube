"use client";

import { useState } from "react";
import { nextTabMotion, type TabMotion } from "./motionMath";

/**
 * The direction a pane should enter from when `key` changes, as a value for
 * `data-mo-pane` (`motion` is undefined until the first change, so nothing
 * animates on load; `from` is the key before the latest change). `order` is the tab order: a later tab slides in from the right, an
 * earlier one from the left. Worked out during render, so the animation starts
 * in the same commit as the new content — nothing is delayed or unmounted.
 */
export function useTabMotion<K extends string>(key: K, order: readonly K[]): { motion: TabMotion | undefined; from: K | undefined } {
  const [seen, setSeen] = useState<{ key: K; from: K | undefined; motion: TabMotion | null }>({ key, from: undefined, motion: null });
  if (seen.key !== key) {
    setSeen({ key, from: seen.key, motion: nextTabMotion(seen.motion, order.indexOf(seen.key), order.indexOf(key)) });
  }
  return { motion: seen.motion ?? undefined, from: seen.from };
}
