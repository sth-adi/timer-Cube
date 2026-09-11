"use client";

import { useEffect, useRef, useState } from "react";
import { TrainerView } from "./TrainerView";
import { AlgorithmsView } from "@/components/algorithms/AlgorithmsView";
import { RecognitionTrainer } from "@/components/algorithms/RecognitionTrainer";
import { CrossDrill } from "./CrossDrill";
import { BldMemoTrainer } from "./BldMemoTrainer";
import { RaceMode } from "./RaceMode";
import { DualReplay } from "./DualReplay";
import { DailyChallengeView } from "./DailyChallengeView";
import type { PendingTrainerNav } from "@/lib/store/navigationStore";
import { useTrainerStore } from "@/lib/store/trainerStore";
import { cn } from "@/lib/utils/cn";

const MODES = [
  { id: "drill", label: "Drill" },
  { id: "cross", label: "Cross" },
  { id: "recognize", label: "Recognize" },
  { id: "daily", label: "Daily" },
  { id: "bld", label: "BLD memo" },
  { id: "race", label: "Race" },
  { id: "replay", label: "Dual replay" },
  { id: "library", label: "Library" },
] as const;

type Mode = (typeof MODES)[number]["id"];

interface TrainerHubProps {
  /** Set by page.tsx when the daily practice plan card asks to land on a specific drill sub-mode or the Library, rather than just the Trainer tab's default view. */
  pendingNav?: PendingTrainerNav | null;
  /** Tells page.tsx this request has been acted on, so a later unrelated remount of this component doesn't replay it. */
  onConsumedNav?: () => void;
}

export function TrainerHub({ pendingNav, onConsumedNav }: TrainerHubProps) {
  const [mode, setMode] = useState<Mode>("drill");
  const [autoStartReview, setAutoStartReview] = useState<{ seq: number } | null>(null);
  const setTrainerMode = useTrainerStore((s) => s.setMode);

  // Edge-triggered off pendingNav.seq (a ref, not state) so a request is
  // acted on exactly once per seq even if this effect re-runs for another
  // reason — see page.tsx's subscription for why the request arrives as a
  // resolved prop instead of this component reading navigationStore itself.
  // The actual setState calls are deferred into a microtask: they include
  // onConsumedNav, which updates page.tsx's state, and calling a different
  // component's setter synchronously from within this effect body isn't
  // safe — deferring it here is the documented escape hatch for that.
  const consumedSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingNav || consumedSeqRef.current === pendingNav.seq) return;
    consumedSeqRef.current = pendingNav.seq;
    void Promise.resolve().then(() => {
      if (pendingNav.target === "trainer-review") {
        setMode("library");
        setAutoStartReview({ seq: pendingNav.seq });
      } else if (pendingNav.target === "trainer-f2l") {
        setMode("drill");
        void setTrainerMode("f2l");
      } else if (pendingNav.target === "trainer-oll") {
        setMode("drill");
        void setTrainerMode("oll");
      } else if (pendingNav.target === "trainer-pll") {
        setMode("drill");
        void setTrainerMode("pll");
      } else if (pendingNav.target === "trainer-zbll") {
        setMode("drill");
        void setTrainerMode("zbll");
      } else if (pendingNav.target === "trainer-daily") {
        setMode("daily");
      }
      onConsumedNav?.();
    });
  }, [pendingNav, setTrainerMode, onConsumedNav]);

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              mode === m.id ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "drill" ? (
        <TrainerView />
      ) : mode === "cross" ? (
        <CrossDrill />
      ) : mode === "recognize" ? (
        <RecognitionTrainer />
      ) : mode === "daily" ? (
        <DailyChallengeView />
      ) : mode === "bld" ? (
        <BldMemoTrainer />
      ) : mode === "race" ? (
        <RaceMode />
      ) : mode === "replay" ? (
        <DualReplay />
      ) : (
        <AlgorithmsView autoStartReview={autoStartReview} onAutoStartConsumed={() => setAutoStartReview(null)} />
      )}
    </div>
  );
}
