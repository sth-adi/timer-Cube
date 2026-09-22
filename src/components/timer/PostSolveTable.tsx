"use client";

import { useMemo } from "react";
import type { PostSolvePhaseRow } from "@/lib/analysis/postSolveTable";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { crossLookaheadFacelets, f2lPairSlotFacelets } from "@/lib/analysis/pieceLookahead";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { CubeLookaheadIcon } from "@/components/timer/CubeLookaheadIcon";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

function fmt(ms: number | null): string {
  return ms === null ? "—" : formatTime(ms);
}

/** Human labels for f2lPairIndex's physical slots (0=URF/FR..3=UBR/BR — see pieceLookahead.ts). */
const F2L_SLOT_LABEL = ["Front-right", "Front-left", "Back-left", "Back-right"] as const;

/** The scramble plus every recorded move up to (and including) `atMs`, as one alg string — reconstructs exactly the cube state at that instant so a pair's icon can show it as it actually looked the moment that pair went in, not the post-scramble look-ahead. */
function algUpTo(scramble: string, moves: SmartCubeMove[], atMs: number | null): string {
  if (atMs === null) return scramble;
  const tokens = moves.filter((m) => m.timeStampMs <= atMs).map((m) => m.token);
  return tokens.length ? `${scramble} ${tokens.join(" ")}` : scramble;
}

function RowIcon({ row, scramble, moves }: { row: PostSolvePhaseRow; scramble: string; moves: SmartCubeMove[] }) {
  if (row.label === "Cross") {
    return <CubeLookaheadIcon scramble={scramble} highlighted={crossLookaheadFacelets(scramble)} className="h-7 w-7 shrink-0" />;
  }
  if (row.f2lPairIndex !== null) {
    const stateAlg = algUpTo(scramble, moves, row.atMs);
    const highlighted = new Set(f2lPairSlotFacelets(row.f2lPairIndex));
    return <CubeLookaheadIcon scramble={stateAlg} highlighted={highlighted} className="h-9 w-9 shrink-0" />;
  }
  const algCase = row.group && row.caseName ? findCase(row.group, row.caseName) : undefined;
  if (!algCase) return null;
  return <CaseIcon setupAlg={invertAlg(algCase.alg)} kind={row.group!} className="h-7 w-7 shrink-0 overflow-hidden rounded-[2px]" />;
}

/**
 * The Cubeast-style post-solve breakdown: one row per CFOP phase (F2L
 * expanded into one row per pair, in the order it was actually solved) with
 * its case (icon + name, where one applies), total time, and how much of
 * that total was spent recognizing the case versus actually executing it. A
 * real table rather than the scattered pills this used to be — see
 * buildPostSolveRows for where every number comes from.
 *
 * Cross doesn't have a "case" the way OLL/PLL do, so its icon shows
 * something different but just as useful: a 3D look-ahead view of the
 * scrambled cube with whichever cross pieces the scramble happened to
 * already leave solved highlighted. Each F2L pair's icon instead shows the
 * cube exactly as it looked the instant that pair was completed, with just
 * that one pair's 5 stickers highlighted — a real "picture of the case",
 * not a lookahead — reconstructed by replaying the recorded moves up to
 * that pair's own timestamp (see lib/analysis/pieceLookahead.ts).
 */
export function PostSolveTable({ rows, scramble, moves }: { rows: PostSolvePhaseRow[]; scramble: string; moves: SmartCubeMove[] }) {
  const rowIcons = useMemo(
    () => rows.map((row) => <RowIcon key={row.label} row={row} scramble={scramble} moves={moves} />),
    [rows, scramble, moves],
  );

  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_3.2rem_3.2rem] items-center gap-x-2 gap-y-2.5 text-[11px]">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Phase</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Total</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Reco</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Exec</span>

        {rows.map((row, i) => (
          <div key={row.label} className="contents">
            <span className="flex min-w-0 items-center gap-2">
              {rowIcons[i]}
              <span className="truncate">
                <span className={cn("font-medium", row.totalMs !== null ? "text-foreground" : "text-muted-2")}>{row.label}</span>
                {row.caseName && <span className="text-muted-2"> · {row.caseName}</span>}
                {row.f2lPairIndex !== null && <span className="text-muted-2"> · {F2L_SLOT_LABEL[row.f2lPairIndex]}</span>}
              </span>
            </span>
            <span className="text-right tabular-nums text-foreground">{fmt(row.totalMs)}</span>
            <span className="text-right tabular-nums text-muted-2">{fmt(row.recognitionMs)}</span>
            <span className="text-right tabular-nums text-muted-2">{fmt(row.executionMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
