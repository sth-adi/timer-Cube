"use client";

import { useState } from "react";
import { TrainerView } from "./TrainerView";
import { AlgorithmsView } from "@/components/algorithms/AlgorithmsView";
import { cn } from "@/lib/utils/cn";

export function TrainerHub() {
  const [mode, setMode] = useState<"drill" | "library">("drill");

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-3">
      <div className="flex gap-2">
        {(["drill", "library"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors",
              mode === m ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "drill" ? <TrainerView /> : <AlgorithmsView />}
    </div>
  );
}
