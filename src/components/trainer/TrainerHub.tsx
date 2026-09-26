"use client";

import { useEffect, useRef, useState } from "react";
import { Bluetooth, Brain, CalendarCheck, Crosshair, Dumbbell, GitCompare, Library as LibraryIcon, ScanEye, Swords } from "lucide-react";
import { TrainerView } from "./TrainerView";
import { AlgorithmsView } from "@/components/algorithms/AlgorithmsView";
import { RecognitionTrainer } from "@/components/algorithms/RecognitionTrainer";
import { AlgGymTrainer } from "@/components/gym/AlgGymTrainer";
import { CrossDrill } from "./CrossDrill";
import { BldMemoTrainer } from "./BldMemoTrainer";
import { RaceHub } from "./RaceHub";
import { DualReplay } from "./DualReplay";
import { DailyChallengeView } from "./DailyChallengeView";
import type { PendingTrainerNav } from "@/lib/store/navigationStore";
import { useTrainerStore } from "@/lib/store/trainerStore";
import { cn } from "@/lib/utils/cn";

const MODES = [
  { id: "drill", label: "Drill", icon: Dumbbell },
  { id: "gym", label: "Gym", icon: Bluetooth },
  { id: "cross", label: "Cross", icon: Crosshair },
  { id: "recognize", label: "Recognize", icon: ScanEye },
  { id: "daily", label: "Daily", icon: CalendarCheck },
  { id: "bld", label: "BLD memo", icon: Brain },
  { id: "race", label: "Race", icon: Swords },
  { id: "replay", label: "Dual replay", icon: GitCompare },
  { id: "library", label: "Library", icon: LibraryIcon },
] as const;

type Mode = (typeof MODES)[number]["id"];

const MODE_BLURB: Record<Mode, string> = {
  drill: "Solve timed reps of a single algorithm set until it's automatic.",
  gym: "OLL/PLL set up on your real cube and timed off its turns — yellow top, green facing you.",
  cross: "Plan an optimal cross before you touch the cube.",
  recognize: "Flashcard drill — name the case fast, no algorithm required.",
  daily: "One curated scramble a day, same for everyone.",
  bld: "Voice-guided memo practice for blindfolded attempts.",
  race: "Live head-to-head, or a room of racers and spectators — free-for-all or bracket.",
  replay: "Watch two solves side by side, synced move for move.",
  library: "Every OLL/PLL/ZBLL case, spaced-repetition review included.",
};

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
    <div className="flex w-full flex-1 flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-0.5 text-center">
        <h1 className="text-lg font-semibold text-foreground">Trainer</h1>
        <p className="max-w-sm text-xs text-muted-2">{MODE_BLURB[mode]}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-bg-panel-2 hover:text-foreground",
              )}
            >
              <Icon size={14} />
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "drill" ? (
        <TrainerView />
      ) : mode === "gym" ? (
        <AlgGymTrainer />
      ) : mode === "cross" ? (
        <CrossDrill />
      ) : mode === "recognize" ? (
        <RecognitionTrainer />
      ) : mode === "daily" ? (
        <DailyChallengeView />
      ) : mode === "bld" ? (
        <BldMemoTrainer />
      ) : mode === "race" ? (
        <RaceHub />
      ) : mode === "replay" ? (
        <DualReplay />
      ) : (
        <AlgorithmsView autoStartReview={autoStartReview} onAutoStartConsumed={() => setAutoStartReview(null)} />
      )}
    </div>
  );
}
