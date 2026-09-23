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
 * history (see lib/analysis/prediction.ts) — hidden unless it has proved
 * better than your recent average on solves it wasn't trained on, and never shown as a hard number,
 * always with a "~" and the word "predicted", since it's a rough regression
 * estimate, not a guarantee.
 */
export function PredictionBadge() {
  const scramble = useScrambleStore((s) => s.scramble);
  const rawSolves = useSessionStore((s) => s.solves);

  const prediction = useMemo(() => {
    return predictSolveTime(normalSolves(rawSolves), scramble);
  }, [rawSolves, scramble]);

  // Only shown once the model has beaten "your recent average" on your own
  // later solves — otherwise the number says nothing about this scramble.
  if (!prediction?.skill?.useful) return null;

  const { skill } = prediction;
  const pbPct = prediction.pbProbability !== null ? Math.round(prediction.pbProbability * 100) : null;

  return (
    <p
      className="flex items-center gap-1 text-xs text-muted-2"
      title={`A rough estimate from a model trained on your own solves for scrambles shaped like this one. Checked on your last ${skill.testSize} solves: off by ${(skill.modelMaeMs / 1000).toFixed(2)}s on average, versus ${(skill.baselineMaeMs / 1000).toFixed(2)}s for just guessing your recent average.`}
    >
      <Sparkles size={11} />
      predicted ~{formatTime(prediction.predictedMs)}
      {pbPct !== null && pbPct >= 10 && <span className="text-accent">· {pbPct}% PB chance</span>}
    </p>
  );
}
