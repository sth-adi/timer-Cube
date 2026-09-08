"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, X } from "lucide-react";
import { getCase, useAlgorithmStore } from "@/lib/store/algorithmStore";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { ReviewRating } from "@/lib/algorithms/srs";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), { ssr: false });

const RATING_BUTTONS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: "again", label: "Again", className: "bg-danger/15 text-danger" },
  { rating: "hard", label: "Hard", className: "bg-warning/15 text-warning" },
  { rating: "good", label: "Good", className: "bg-accent-soft text-accent" },
  { rating: "easy", label: "Easy", className: "bg-success/15 text-success" },
];

export function ReviewSession({ initialQueue, onDone }: { initialQueue: string[]; onDone: () => void }) {
  const [queue, setQueue] = useState(initialQueue);
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const review = useAlgorithmStore((s) => s.review);

  const currentId = queue[0];
  const currentCase = currentId ? getCase(currentId) : null;

  const setupAlg = useMemo(() => (currentCase ? invertAlg(currentCase.alg) : ""), [currentCase]);

  const onRate = (rating: ReviewRating) => {
    if (!currentCase) return;
    review(currentCase.id, rating);
    setReviewedCount((n) => n + 1);
    setRevealed(false);
    setQueue((q) => {
      const rest = q.slice(1);
      // "Again" cases reappear later in this same session, matching how a
      // real spaced-repetition session reinforces a lapse immediately
      // rather than only after its 10-minute cooldown elapses.
      if (rating === "again") {
        const reinsertAt = Math.min(rest.length, 3);
        return [...rest.slice(0, reinsertAt), currentCase.id, ...rest.slice(reinsertAt)];
      }
      return rest;
    });
  };

  if (!currentCase) {
    return (
      <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-semibold">Session complete 🎉</p>
        <p className="text-muted-2 text-sm">Reviewed {reviewedCount} case{reviewedCount === 1 ? "" : "s"}.</p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-accent-soft px-5 py-2.5 text-sm font-medium text-accent"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-4 py-2">
      <div className="flex w-full items-center justify-between">
        <span className="text-muted-2 text-xs">{queue.length} left</span>
        <button type="button" onClick={onDone} className="tap-target -mr-2 text-muted hover:text-foreground">
          <X size={18} />
        </button>
      </div>

      <div className="card h-56 w-full overflow-hidden rounded-xl">
        <CubeViewer alg="" setupAlg={setupAlg} className="h-full w-full" />
      </div>

      <p className="text-sm font-medium">{currentCase.name}</p>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-muted-2 hover:text-muted hover:bg-bg-panel-2"
        >
          <Eye size={14} /> Reveal algorithm
        </button>
      ) : (
        <p className="tabular-timer text-center text-sm">{currentCase.alg}</p>
      )}

      <div className="mt-auto grid w-full grid-cols-4 gap-2">
        {RATING_BUTTONS.map((b) => (
          <button
            key={b.rating}
            type="button"
            onClick={() => onRate(b.rating)}
            className={cn("rounded-lg py-3 text-xs font-medium", b.className)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
