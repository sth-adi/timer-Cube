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
import type { AlgExecution } from "@/lib/xray/algMicroscope";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { myAlgKey, normalizedAlg, sameAlg, type SeenAlg } from "@/lib/algorithms/myAlgs";
import { useSessionStore } from "@/lib/store/sessionStore";
import { caseRecords, type CaseRecord } from "@/lib/analysis/caseRecord";
import { f2lCaseStats, type F2lCaseStat } from "@/lib/analysis/f2lCaseStats";
import { solveCrossOptimal } from "@/lib/solvers/cross";

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
  /** This F2L pair's own stable case identity (for f2lCaseStats), and how many turns it actually took. */
  f2lKey: string | null;
  f2lTurns: number | null;
}

function viewFor(row: PostSolvePhaseRow, scramble: string, moves: SmartCubeMove[], crossFace: CrossFace): RowView {
  if (row.label === "Cross") {
    const solvedEdges = crossLookaheadFacelets(scramble).size / 2;
    return {
      row,
      caseName: solvedEdges > 0 ? `${solvedEdges} edge${solvedEdges === 1 ? "" : "s"} already solved` : null,
      icon: <CrossGlyph color={CROSS_FACE_HEX[crossFace]} />,
      f2lKey: null,
      f2lTurns: null,
    };
  }
  if (row.f2lPairIndex !== null) {
    // The case is what was in front of you when you *started* the pair.
    const f2l: F2lCase | null = row.startMs !== null ? recognizeF2lCase(cubeAt(scramble, moves, row.startMs), row.f2lPairIndex) : null;
    const f2lTurns = row.startMs !== null && row.atMs !== null ? moves.filter((m) => m.timeStampMs > row.startMs! && m.timeStampMs <= row.atMs!).length : null;
    return {
      row,
      caseName: f2l?.name ?? null,
      icon: f2l ? <F2lCaseIcon facelets={f2l.facelets} pairFacelets={f2l.pairFacelets} className={ICON} /> : <span className={ICON} />,
      f2lKey: f2l?.key ?? null,
      f2lTurns,
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
    f2lKey: null,
    f2lTurns: null,
  };
}

const PACE_CLASS = { fast: "text-success", normal: "text-foreground", slow: "text-warning" } as const;

/**
 * Under an OLL/PLL row: the algorithm you actually did, whether it took two
 * looks, and how this execution compares with every other time you've done
 * that same algorithm — "1.21s · your best".
 */
function AlgLine({ exec, seen, caseRecord }: { exec: AlgExecution; seen: readonly SeenAlg[] | undefined; caseRecord?: CaseRecord }) {
  const norm = normalizedAlg(exec.mergedAlg);
  const mine = norm ? seen?.find((x) => normalizedAlg(x.alg) === norm) : undefined;
  const pb = mine && mine.count >= 2 && exec.executionMs <= mine.bestExecMs;
  const key = myAlgKey(exec.step, exec.caseName);
  const mainAlg = useMyAlgsStore((s) => s.chosen[key]);
  const choose = useMyAlgsStore((s) => s.choose);
  // A clean, one-look execution that isn't already what you'd pull up for
  // this case in the algorithm library — worth a one-tap promotion right
  // from the recap, instead of a separate trip to set it there.
  const offerMain = exec.oneLook && norm !== null && (!mainAlg || !sameAlg(mainAlg, exec.mergedAlg));
  return (
    <span className="mt-0.5 flex min-w-0 flex-col text-[10px] leading-tight">
      <span className="truncate font-mono text-muted" title={exec.mergedAlg}>
        {exec.mergedAlg}
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5">
        {!exec.oneLook ? (
          <span className="font-semibold text-warning">two looks</span>
        ) : mine ? (
          <span className="text-muted-2">{mine.book ? "book alg" : "your alg"}</span>
        ) : null}
        {pb ? (
          <span className="font-semibold text-success">best execution yet</span>
        ) : mine && mine.count >= 2 ? (
          <span className="text-muted-2">usually {secs(mine.meanExecMs)}s to execute</span>
        ) : null}
        {offerMain && (
          <button
            type="button"
            onClick={() => choose(key, exec.mergedAlg)}
            className="rounded-full bg-accent-soft px-1.5 py-[1px] font-medium text-accent hover:brightness-110"
          >
            Use as main alg
          </button>
        )}
      </span>
      {/* The case itself, not the algorithm — two solves of the same case can use two different algs. */}
      {caseRecord && caseRecord.count >= 2 && (
        <span className="text-muted-2">
          {caseRecord.count} times so far · case best {secs(caseRecord.bestMs)}s
        </span>
      )}
    </span>
  );
}

/** Under the Cross row: how many turns it took against the fewest a computer could ever need from this exact scramble. */
function CrossEfficiencyLine({ turns, optimal }: { turns: number; optimal: number }) {
  if (turns <= 0) return null;
  return (
    <span className="mt-0.5 block text-[10px] leading-tight text-muted-2">
      {turns} turn{turns === 1 ? "" : "s"} · optimal {optimal === turns ? "— nice" : `was ${optimal}`}
    </span>
  );
}

/**
 * Under an F2L row: this pair's own turn count against how many you usually
 * need for this exact case — not a computer's minimum (a one-look human
 * rarely matches that anyway), but proof, from your own history, that a
 * shorter insert was findable from there.
 */
function F2lEfficiencyLine({ turns, stat }: { turns: number; stat?: F2lCaseStat }) {
  if (turns <= 0 || !stat || stat.count < 3) return null;
  const extra = turns - stat.meanTurns;
  return (
    <span className={cn("mt-0.5 block text-[10px] leading-tight", extra >= 2 ? "text-warning" : "text-muted-2")}>
      {turns} turn{turns === 1 ? "" : "s"} · you usually take {stat.meanTurns.toFixed(1)} for this
    </span>
  );
}

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
  executions = [],
}: {
  rows: PostSolvePhaseRow[];
  /** Scramble and moves in the analysis frame (cross on white) — see crossFrame.ts. */
  scramble: string;
  moves: SmartCubeMove[];
  baseline?: PostSolveBaseline | null;
  crossFace?: CrossFace;
  /** This solve's OLL/PLL executions (see algMicroscope), to name the algorithm under each. */
  executions?: readonly AlgExecution[];
}) {
  const seen = useMyAlgsStore((s) => s.seen);
  const allSolves = useSessionStore((s) => s.allSolves);
  const caseHistory = useMemo(() => caseRecords(allSolves), [allSolves]);
  const f2lHistory = useMemo(() => f2lCaseStats(allSolves), [allSolves]);
  const views = useMemo(() => rows.map((row) => viewFor(row, scramble, moves, crossFace)), [rows, scramble, moves, crossFace]);
  const max = Math.max(1, ...rows.map((r) => r.totalMs ?? 0));
  // The fewest turns a computer could ever need for this exact cross — the
  // analysis frame always has the cross on white, exactly what the optimal
  // cross solver expects, so no relabelling is needed here.
  const crossOptimal = useMemo(() => {
    try {
      return solveCrossOptimal(scramble).length;
    } catch {
      return null;
    }
  }, [scramble]);
  const crossRow = rows.find((r) => r.label === "Cross");
  const crossTurns = crossRow?.atMs != null ? moves.filter((m) => m.timeStampMs <= crossRow.atMs!).length : null;

  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <div className="flex flex-col gap-2.5">
        {views.map(({ row, icon, caseName, f2lKey, f2lTurns }, i) => {
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
                  {row.group &&
                    (() => {
                      const exec = executions.find((e) => e.step === row.group);
                      return exec ? <AlgLine exec={exec} seen={seen[myAlgKey(exec.step, exec.caseName)]} caseRecord={caseName ? caseHistory.get(caseName) : undefined} /> : null;
                    })()}
                  {row.label === "Cross" && crossTurns !== null && crossOptimal !== null && <CrossEfficiencyLine turns={crossTurns} optimal={crossOptimal} />}
                  {f2lKey && f2lTurns !== null && <F2lEfficiencyLine turns={f2lTurns} stat={f2lHistory.get(f2lKey)} />}
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
