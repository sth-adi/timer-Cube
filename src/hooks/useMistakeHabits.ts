"use client";

import { useEffect, useState } from "react";
import type { Solve } from "@/types";
import type { MistakeHabit } from "@/lib/analysis/mistakeRadar";
import { scheduleMistakeHabits } from "@/lib/analysis/idleWarm";

/**
 * `mistakeHabits(solves)` without freezing the screen: the solves not yet
 * replayed are replayed in idle time (each is only ever replayed once), and
 * the previous habits stay on screen until the new ones land. `undefined`
 * until the first pass finishes, and whenever `solves` is `undefined`.
 */
export function useMistakeHabits(solves: readonly Solve[] | undefined): MistakeHabit[] | undefined {
  const [habits, setHabits] = useState<MistakeHabit[]>();
  useEffect(() => (solves ? scheduleMistakeHabits(solves, setHabits) : undefined), [solves]);
  return solves ? habits : undefined;
}
