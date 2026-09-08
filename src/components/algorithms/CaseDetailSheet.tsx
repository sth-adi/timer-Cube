"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import type { AlgCase } from "@/lib/algorithms/types";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { deriveStatus } from "@/lib/algorithms/srs";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), { ssr: false });

const STATUS_LABEL = { new: "New", learning: "Learning", known: "Known" } as const;
const STATUS_COLOR = {
  new: "text-muted-2",
  learning: "text-warning",
  known: "text-success",
} as const;

function now(): number {
  return Date.now();
}

export function CaseDetailSheet({ algCase, onClose }: { algCase: AlgCase; onClose: () => void }) {
  const progress = useAlgorithmStore((s) => s.progress[algCase.id]);
  const status = deriveStatus(progress);
  // Captured once at open time — this is a rough "in about N days" readout,
  // not a live countdown, so it doesn't need to track the wall clock.
  const openedAt = useMemo(() => now(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          "glass-panel w-full rounded-t-2xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[88vh] overflow-y-auto",
          "sm:max-w-sm sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{algCase.name}</h2>
            {algCase.shape && <p className="text-muted-2 text-xs">{algCase.shape}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 text-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="card h-56 w-full overflow-hidden rounded-xl">
          <CubeViewer
            alg={algCase.alg}
            setupAlg={invertAlg(algCase.alg)}
            controlPanel="bottom-row"
            className="h-full w-full"
          />
        </div>

        <p className="tabular-timer mt-3 text-sm leading-relaxed">{algCase.alg}</p>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2 text-xs">
          <span className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</span>
          {progress && progress.reps > 0 && (
            <span className="text-muted-2">
              {progress.reps} review{progress.reps === 1 ? "" : "s"} · next in{" "}
              {Math.max(0, Math.round((progress.dueAt - openedAt) / (24 * 60 * 60 * 1000)))}d
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
