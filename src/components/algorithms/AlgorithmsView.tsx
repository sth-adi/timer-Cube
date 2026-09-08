"use client";

import { useState } from "react";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { AlgorithmLibrary } from "./AlgorithmLibrary";
import { ReviewSession } from "./ReviewSession";

export function AlgorithmsView() {
  const [reviewQueue, setReviewQueue] = useState<string[] | null>(null);
  const dueCaseIds = useAlgorithmStore((s) => s.dueCaseIds);

  if (reviewQueue) {
    return <ReviewSession initialQueue={reviewQueue} onDone={() => setReviewQueue(null)} />;
  }

  return <AlgorithmLibrary onStartReview={() => setReviewQueue(dueCaseIds())} />;
}
