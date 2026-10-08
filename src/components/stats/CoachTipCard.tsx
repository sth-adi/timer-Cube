"use client";

import { useMemo } from "react";
import type { Solve } from "@/types";
import { computeCoachTip } from "@/lib/analysis/smartCubeInsights";

/**
 * One synthesized, actionable suggestion drawn from whichever smart-cube
 * signal is standing out the most right now — a single sentence to act on
 * today, rather than a wall of stats to interpret yourself.
 */
export function CoachTipCard({ solves }: { solves: Solve[] }) {
  const tip = useMemo(() => computeCoachTip(solves), [solves]);

  if (!tip) return null;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-2">Coach tip</p>
      <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{tip.title}</h3>
      <p className="mt-1 max-w-[65ch] text-pretty text-xs leading-relaxed text-muted">{tip.detail}</p>
    </div>
  );
}
