"use client";

import { useMemo } from "react";
import type { PostSolvePhaseRow } from "@/lib/analysis/postSolveTable";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { crossLookaheadFacelets } from "@/lib/analysis/pieceLookahead";
import { recognizeF2lCase, type F2lCase } from "@/lib/analysis/f2lCase";
import { Cube } from "@/lib/cube-engine/engine";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { F2lCaseIcon } from "@/components/algorithms/F2lCaseIcon";
import { formatTime } from "@/lib/utils/time";
import { paceFor, type PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { cn } from "@/lib/utils/cn";
import { CROSS_FACE_HEX, type CrossFace } from "@/lib/smartcube/crossFrame";

const secs = (ms: number) => (ms / 1000).toFixed(2);

/** The cube exactly as it was at `atMs`: the scramble plus every move made up to then. */
function cubeAt(scramble: string, moves: SmartCubeMove[], atMs: number | null): InstanceType<typeof Cube> {
  const cube = new Cube();
  const tokens = atMs === null ? [] : moves.filter((m) => m.timeStampMs <= atMs).map((m) => m.token);
  const alg = [scramble, ...tokens].join(" ").trim();
  if (alg) cube.move(alg);
  return cube;
}

const ICON = "h-10 w-10 shrink-0";

/** The cross, drawn flat in the colour you built it on. */
function CrossGlyph({ color = CROSS_FACE_HEX.U }: { color?: string }) {
  return (
    <svg viewBox="0 0 3 3" className={cn(ICON, "p-1.5")} aria-hidden>
      {[
        [0, 0], [2, 0], [0, 2], [2, 2],
      ].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.12} fill="#3a3d46" />
      ))}
      {[
        [1, 0], [0, 1], [1, 1], [2, 1], [1, 2],
      ].map(([x, y]) => (
        <rect key={`c${x}${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.12} fill={color} />
      ))}
    </svg>
  );
}

interface RowView {
  row: PostSolvePhaseRow;
  icon: React.ReactNode;
  caseName: string | null;
}

function viewFor(row: PostSolvePhaseRow, scramble: string, moves: SmartCubeMove[], crossFace: CrossFace): RowView {
  if (row.label === "Cross") {
    const solvedEdges = crossLookaheadFacelets(scramble).size / 2;
    return { row, caseName: solvedEdges > 0 ? `${solvedEdges} edge${solvedEdges === 1 ? "" : "s"} already solved` : null, icon: <CrossGlyph color={CROSS_FACE_HEX[crossFace]} /> };
  }
  if (row.f2lPairIndex !== null) {
    // The case is what was in front of you when you *started* the pair.
    const f2l: F2lCase | null = row.startMs !== null ? recognizeF2lCase(cubeAt(scramble, moves, row.startMs), row.f2lPairIndex) : null;
    return {
      row,
      caseName: f2l?.name ?? null,
      icon: f2l ? <F2lCaseIcon facelets={f2l.facelets} pairFacelets={f2l.pairFacelets} className={ICON} /> : <span className={ICON} />,
    };
  }
  const algCase = row.group && row.caseName ? findCase(row.group, row.caseName) : undefined;
  return {
    row,
    caseName: row.caseName,
    icon: algCase ? (
      <CaseIcon setupAlg={invertAlg(algCase.alg)} kind={row.group!} className={cn(ICON, "overflow-hidden rounded-[3px] p-0.5")} />
    ) : (
      <span className={ICON} />
    ),
  };
}

const PACE_CLASS = { fast: "text-success", normal: "text-foreground", slow: "text-warning" } as const;

/**
 * The post-solve breakdown: one row per step (each F2L pair in the order you
 * solved it), with the case you had, the time, and a bar split into
 * recognising the case (light) and turning through it (solid). With enough
 * history, each row's array position doubles as its index into `baseline`
 * (same solve-order convention SolveMetrics.segments uses — Cross, then
 * each pair as you reach it, then OLL, PLL), and its time reads green when
 * it's within your own better quarter for that step, amber when it ran
 * noticeably past your median — "5.20s" turned into a number you don't have
 * to hold your own history in your head to read.
 */
export function PostSolveTable({
  rows,
  scramble,
  moves,
  baseline,
  crossFace = "U",
}: {
  rows: PostSolvePhaseRow[];
  /** Scramble and moves in the analysis frame (cross on white) — see crossFrame.ts. */
  scramble: string;
  moves: SmartCubeMove[];
  baseline?: PostSolveBaseline | null;
  crossFace?: CrossFace;
}) {
  const views = useMemo(() => rows.map((row) => viewFor(row, scramble, moves, crossFace)), [rows, scramble, moves, crossFace]);
  const max = Math.max(1, ...rows.map((r) => r.totalMs ?? 0));

  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <div className="flex flex-col gap-2.5">
        {views.map(({ row, icon, caseName }, i) => {
          const look = row.recognitionMs ?? 0;
          const turn = row.executionMs ?? row.totalMs ?? 0;
          const pace = paceFor(row.totalMs, baseline?.segments[i] ?? null);
          return (
            <div key={row.label} className="flex items-center gap-2.5">
              {icon}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="min-w-0 text-xs leading-tight" title={caseName ?? undefined}>
                  <span className={cn("font-semibold", row.totalMs !== null ? "text-foreground" : "text-muted-2")}>{row.label}</span>
                  {caseName && <span className="block truncate text-[11px] text-muted-2">{caseName}</span>}
                </p>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-bg-elevated">
                  <div className="h-full bg-warning/50" style={{ width: `${(look / max) * 100}%` }} />
                  <div className="h-full bg-accent" style={{ width: `${(turn / max) * 100}%` }} />
                </div>
              </div>
              <div className="w-14 shrink-0 text-right">
                <p
                  className={cn("text-sm font-semibold tabular-nums", row.totalMs === null ? "text-muted-2" : pace ? PACE_CLASS[pace] : "text-foreground")}
                  title={pace === "fast" ? "One of your better ones for this step" : pace === "slow" ? "Slower than usual for this step" : undefined}
                >
                  {row.totalMs === null ? "—" : formatTime(row.totalMs)}
                </p>
                {row.recognitionMs !== null && row.executionMs !== null && (
                  <p className="text-[10px] tabular-nums text-muted-2">
                    {secs(row.recognitionMs)} + {secs(row.executionMs)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-center justify-center gap-3 text-[10px] text-muted-2">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-full bg-warning/50" /> recognising
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-full bg-accent" /> turning
        </span>
        {baseline && (
          <span className="flex items-center gap-1">
            <span className={cn("h-1.5 w-3 rounded-full bg-current", PACE_CLASS.fast)} /> vs. your own history
          </span>
        )}
      </p>
    </div>
  );
}
