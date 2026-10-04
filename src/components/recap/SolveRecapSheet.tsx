"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Play, Wand2, X } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { solveBreakdown } from "@/lib/analysis/solveBreakdown";
import { reconstruction } from "@/lib/analysis/reconText";
import { pbSolveRows, timeWonLost } from "@/lib/analysis/timeWonLost";
import { buildPostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { analyzeMistakes, mistakesByRow } from "@/lib/analysis/mistakeRadar";
import { useMistakeHabits } from "@/hooks/useMistakeHabits";
import { inspectionReport } from "@/lib/inspection/report";
import { CROSS_FACE_COLOR } from "@/lib/smartcube/crossFrame";
import { PostSolveTable } from "@/components/timer/PostSolveTable";
import { MistakeRadarCard } from "@/components/lab/MistakeRadarCard";
import { InspectionGradeCard } from "@/components/inspection/InspectionGradeCard";
import { XrayTeaser } from "@/components/xray/XrayTeaser";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { ReconstructionCard } from "./ReconstructionCard";
import { SolveActionBar } from "./SolveActionBar";
import { TimeWonLostCard } from "./TimeWonLostCard";
import { formatResult, formatTime } from "@/lib/utils/time";
import { solveFinalMs, type Solve } from "@/types";
import { cn } from "@/lib/utils/cn";
import { useModalLayer } from "@/hooks/useModalLayer";

/**
 * The full recap of any past smart-cube solve — the same breakdown the
 * timer shows the moment a solve finishes (every step with its case, the
 * algorithm you did, looking vs turning, pace against your history), plus
 * where the time went, the written reconstruction, the Mistake Radar, the
 * inspection grade and the X-Ray — rebuilt from what the solve saved.
 */
export function SolveRecapSheet({ solve, onClose, onMore }: { solve: Solve; onClose: () => void; /** Hands over to the row's own popup (its scramble, gyro reconstruction and so on). */ onMore?: () => void }) {
  const allSolves = useSessionStore((s) => s.allSolves);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const router = useRouter();
  const pathname = usePathname();
  const [replay, setReplay] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalLayer(dialogRef, onClose);

  const b = useMemo(() => solveBreakdown(solve), [solve]);
  const others = useMemo(() => allSolves.filter((s) => s.id !== solve.id), [allSolves, solve.id]);
  const baseline = useMemo(() => buildPostSolveBaseline(metricsFor(others)), [others]);
  const pb = useMemo(() => pbSolveRows(others), [others]);
  const report = useMemo(() => (b ? timeWonLost(b.rows, baseline, pb?.rows ?? null) : null), [b, baseline, pb]);
  const recon = useMemo(() => (b ? reconstruction(b, solve.scramble, { totalMs: b.totalMs, title: `${formatTime(solve.timeMs)} solve` }) : null), [b, solve]);
  const frameTokens = useMemo(() => b?.frameMoves.map((m) => m.token) ?? [], [b]);
  const times = useMemo(() => b?.frameMoves.map((m) => m.timeStampMs) ?? [], [b]);
  const mistakes = useMemo(() => (b ? analyzeMistakes({ scramble: b.frameScramble, moves: frameTokens, timesMs: times, totalMs: b.totalMs }) : null), [b, frameTokens, times]);
  const habits = useMistakeHabits(others);
  const stepMistakes = useMemo(() => (b && mistakes ? mistakesByRow(b.rows, mistakes.mistakes) : null), [b, mistakes]);
  const inspection = useMemo(() => (b ? inspectionReport(b.frameScramble, frameTokens, times) : null), [b, frameTokens, times]);

  const final = solveFinalMs(solve);
  const turns = b?.moves.length ?? 0;

  const analyze = () => {
    requestAnalysis(solve.scramble, final, solve.id, solve.reconstruction, solve.moveTimestamps);
    onClose();
    if (pathname !== "/") router.push("/?jump=analyze");
  };

  // Portalled to the body: a transformed ancestor (an animated popover) would otherwise trap a fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          "glass-panel flex max-h-[92vh] supports-[height:1dvh]:max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl outline-none p-4 pb-[calc(1rem+var(--safe-bottom))] animate-sheet-in",
          "sm:max-w-md sm:rounded-2xl sm:animate-fade-in-up",
        )}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Solve recap"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="tabular-timer text-3xl font-bold text-foreground">{formatResult(final, solve.penalty)}</p>
            <p className="text-[11px] text-muted-2">
              {new Date(solve.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {b && b.crossFace !== "U" ? ` · ${CROSS_FACE_COLOR[b.crossFace]} cross` : ""}
              {turns ? ` · ${turns} turns · ${(turns / Math.max(0.001, solve.timeMs / 1000)).toFixed(2)} TPS` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="tap-target -mr-1 text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <SolveActionBar solve={solve} onMore={onMore} onDeleted={onClose} />
        <p className="break-words font-mono text-[11px] text-muted-2">{solve.scramble}</p>

        {!b ? (
          <p className="rounded-xl bg-bg-panel-2 p-3 text-[12px] text-muted">
            This solve&apos;s turns weren&apos;t recorded in full (a keyboard solve, or one whose turns were corrected mid-way), so there&apos;s no step-by-step recap for it.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReplay(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-sm font-semibold text-accent-fg">
                <Play size={14} /> Replay
              </button>
              <button type="button" onClick={analyze} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-bg-panel-2 px-3 py-2 text-sm font-medium text-muted hover:text-foreground">
                <Wand2 size={14} /> Analyze
              </button>
            </div>
            <PostSolveTable rows={b.rows} scramble={b.frameScramble} moves={b.frameMoves} baseline={baseline} crossFace={b.crossFace} executions={b.executions} />
            {report && <TimeWonLostCard report={report} />}
            {recon && <ReconstructionCard recon={recon} stepMistakes={stepMistakes} />}
            {mistakes && <MistakeRadarCard report={mistakes} totalMs={b.totalMs} habits={habits} />}
            {inspection && <InspectionGradeCard report={inspection} />}
            <XrayTeaser scramble={b.frameScramble} moves={frameTokens} timesMs={times} solveId={solve.id} />
          </>
        )}
      </div>
      {replay && solve.reconstruction && (
        <div onClick={(e) => e.stopPropagation()}>
          <InstantReplaySheet scramble={solve.scramble} reconstruction={solve.reconstruction} timeMs={solve.timeMs} penalty={solve.penalty} moveTimestamps={solve.moveTimestamps} onClose={() => setReplay(false)} />
        </div>
      )}
    </div>,
    document.body,
  );
}
