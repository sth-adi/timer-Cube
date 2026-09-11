"use client";

import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
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
    <div className="card rounded-xl border-accent/30 bg-accent-soft/40 p-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-accent">
        <Lightbulb size={14} />
        {tip.title}
      </h3>
      <p className="text-xs leading-relaxed text-foreground/90">{tip.detail}</p>
    </div>
  );
}
