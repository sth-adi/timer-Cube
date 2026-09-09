"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { normalSolves } from "@/lib/stats/stats";
import { predictSolveTime } from "@/lib/analysis/prediction";
import { formatTime } from "@/lib/utils/time";

/**
 * Estimated pace for the scramble on screen, trained entirely on your own
 * history (see lib/analysis/prediction.ts) — never shown as a hard number,
 * always with a "~" and the word "predicted", since it's a rough regression
 * estimate, not a guarantee.
 */
export function PredictionBadge() {
  const scramble = useScrambleStore((s) => s.scramble);
  const rawSolves = useSessionStore((s) => s.solves);

  const prediction = useMemo(() => {
    return predictSolveTime(normalSolves(rawSolves), scramble);
  }, [rawSolves, scramble]);

  if (!prediction) return null;

  const pbPct = prediction.pbProbability !== null ? Math.round(prediction.pbProbability * 100) : null;

  return (
    <p
      className="flex items-center gap-1 text-xs text-muted-2"
      title="A rough estimate from a regression model trained on your own solve history for scrambles shaped like this one."
    >
      <Sparkles size={11} />
      predicted ~{formatTime(prediction.predictedMs)}
      {pbPct !== null && pbPct >= 10 && <span className="text-accent">· {pbPct}% PB chance</span>}
    </p>
  );
}
