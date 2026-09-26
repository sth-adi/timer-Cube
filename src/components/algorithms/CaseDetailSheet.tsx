"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import type { AlgCase } from "@/lib/algorithms/types";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { myAlgKey } from "@/lib/algorithms/myAlgs";
import { YourAlgs } from "./YourAlgs";
import { deriveStatus } from "@/lib/algorithms/srs";
import { mapToLibraryFrame, relabelAlg } from "@/lib/analysis/frames";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { CubeViewerHandle } from "@/components/scramble/CubeViewer";

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
  // Published OLL/PLL algs are written last-layer-on-U ("library frame"),
  // but this app's cube views put the practice layer on D (yellow) instead
  // — see CubeViewer's CAMERA_LATITUDE doc comment. mapToLibraryFrame() is a
  // whole-cube-rotation relabeling (self-inverse), so applying it again here
  // carries the alg from library frame back into the D-practice frame every
  // other view already uses, purely by renaming face letters — no risk of
  // the sequential-interpretation corruption a real rotation move would add.
  // The viewer plays your main algorithm (or whichever one you tap below); the setup is always the book's, so the case is the same.
  const main = useMyAlgsStore((s) => s.chosen[myAlgKey(algCase.group, algCase.name)]) ?? algCase.alg;
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picked ?? main;
  const relabeledAlg = useMemo(() => relabelAlg(shown, mapToLibraryFrame()), [shown]);
  const setupAlg = useMemo(() => invertAlg(relabelAlg(algCase.alg, mapToLibraryFrame())), [algCase]);
  // Shown to the user in the alg's own (published, last-layer-on-U) notation
  // — not the D-practice relabeling above, which only exists to feed the 3D
  // viewer and would look like a different, unrecognizable algorithm here.
  const displaySetupAlg = useMemo(() => invertAlg(algCase.alg), [algCase]);
  // Captured once at open time — this is a rough "in about N days" readout,
  // not a live countdown, so it doesn't need to track the wall clock.
  const openedAt = useMemo(() => now(), []);

  const handleRef = useRef<CubeViewerHandle | null>(null);
  const [playing, setPlaying] = useState(false);

  const onReady = useCallback((handle: CubeViewerHandle) => {
    handleRef.current = handle;
    handle.onPlayingChange(setPlaying);
  }, []);

  const onRestart = () => handleRef.current?.jumpToStart();
  const onPlayPause = () => handleRef.current?.togglePlay();

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
          <CubeViewer key={shown} alg={relabeledAlg} setupAlg={setupAlg} onReady={onReady} className="h-full w-full" />
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRestart}
            aria-label="Restart"
            className="tap-target flex items-center justify-center rounded-full bg-bg-panel-2 p-2 text-muted hover:text-foreground"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            {playing ? "Pause" : "Play"}
          </button>
        </div>

        <p className="tabular-timer mt-3 break-words text-center text-[11px] leading-relaxed text-muted-2">
          Setup: {displaySetupAlg}
        </p>
        <p className="tabular-timer mt-1 text-sm leading-relaxed">{shown}</p>

        <div className="mt-3">
          <YourAlgs algCase={algCase} showing={shown} onShow={setPicked} />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2 text-xs">
          <span className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</span>
          {progress && progress.reps > 0 && (
            <span className="text-muted-2">
              {progress.reps} review{progress.reps === 1 ? "" : "s"} · next in{" "}
              {Math.max(0, Math.round((progress.dueAt - openedAt) / (24 * 60 * 60 * 1000)))}d
            </span>
          )}
        </div>
        {progress?.bestRecallMs !== undefined && (
          <p className="mt-2 text-center text-[11px] text-muted-2">
            Best recall: <span className="text-foreground/80">{formatTime(progress.bestRecallMs)}</span> — time to
            reveal the algorithm in review, not physical turning speed
          </p>
        )}
      </div>
    </div>
  );
}
