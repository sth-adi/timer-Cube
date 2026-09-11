"use client";

import { useEffect, useRef, useState } from "react";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { AlgorithmLibrary } from "./AlgorithmLibrary";
import { ReviewSession } from "./ReviewSession";

interface AlgorithmsViewProps {
  /**
   * Set by TrainerHub when the daily practice plan card asks to jump
   * straight into a review session, rather than requiring a click on
   * "Review" once the Library has loaded. Resolved to a one-shot object
   * (not a bare counter) for the same reason page.tsx hands TrainerHub a
   * resolved prop instead of a raw store value — this component can mount
   * fresh with the request already "hot" in its very first props, and a
   * bare counter looks unchanged to a component seeing it for the first
   * time.
   */
  autoStartReview?: { seq: number } | null;
  /** Tells TrainerHub this request has been acted on, so a later unrelated remount of this component doesn't replay it. */
  onAutoStartConsumed?: () => void;
}

export function AlgorithmsView({ autoStartReview, onAutoStartConsumed }: AlgorithmsViewProps) {
  const [reviewQueue, setReviewQueue] = useState<string[] | null>(null);
  const dueCaseIds = useAlgorithmStore((s) => s.dueCaseIds);

  // Edge-triggered off autoStartReview.seq (a ref, not state) — see
  // TrainerHub's own identical guard for why, and for why the actual work
  // is deferred into a microtask rather than done synchronously here.
  const consumedSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (!autoStartReview || consumedSeqRef.current === autoStartReview.seq) return;
    consumedSeqRef.current = autoStartReview.seq;
    void Promise.resolve().then(() => {
      const due = dueCaseIds();
      if (due.length > 0) setReviewQueue(due);
      onAutoStartConsumed?.();
    });
  }, [autoStartReview, dueCaseIds, onAutoStartConsumed]);

  if (reviewQueue) {
    return <ReviewSession initialQueue={reviewQueue} onDone={() => setReviewQueue(null)} />;
  }

  return <AlgorithmLibrary onStartReview={() => setReviewQueue(dueCaseIds())} />;
}
