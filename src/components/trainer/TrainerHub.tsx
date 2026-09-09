"use client";

import { useState } from "react";
import { TrainerView } from "./TrainerView";
import { AlgorithmsView } from "@/components/algorithms/AlgorithmsView";
import { RecognitionTrainer } from "@/components/algorithms/RecognitionTrainer";
import { CrossDrill } from "./CrossDrill";
import { BldMemoTrainer } from "./BldMemoTrainer";
import { RaceMode } from "./RaceMode";
import { DualReplay } from "./DualReplay";
import { cn } from "@/lib/utils/cn";

const MODES = [
  { id: "drill", label: "Drill" },
  { id: "cross", label: "Cross" },
  { id: "recognize", label: "Recognize" },
  { id: "bld", label: "BLD memo" },
  { id: "race", label: "Race" },
  { id: "replay", label: "Dual replay" },
  { id: "library", label: "Library" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export function TrainerHub() {
  const [mode, setMode] = useState<Mode>("drill");

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
      ) : mode === "bld" ? (
        <BldMemoTrainer />
      ) : mode === "race" ? (
        <RaceMode />
      ) : mode === "replay" ? (
        <DualReplay />
      ) : (
        <AlgorithmsView />
      )}
    </div>
  );
}
