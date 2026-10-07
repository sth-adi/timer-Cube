"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
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
import type { Solve } from "@/types";
import type { CaseRecord } from "@/lib/analysis/caseRecord";
import type { F2lCaseStat } from "@/lib/analysis/f2lCaseStats";
import type { RecognitionStat } from "@/lib/analysis/caseHistory";
import { NO_HISTORY, scheduleHistoryStats, type HistoryStats } from "@/lib/analysis/historyStats";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { Collapse, Delta, RecapCard } from "@/components/recap/RecapParts";
import type { CrossAdvisorReport } from "@/lib/analysis/crossAdvisor";

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

const TURNS = (n: number) => `${n} turn${n === 1 ? "" : "s"}`;

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
  /** Where `caseName` deep-links on /cases — absent for the Cross row, which isn't a case. */
  caseLink: { group: "OLL" | "PLL" | "F2L"; key: string } | null;
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
      caseLink: null,
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
      caseLink: f2l ? { group: "F2L", key: f2l.key } : null,
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
    caseLink: row.group && row.caseName ? { group: row.group, key: row.caseName } : null,
  };
}

/** One tint per step (cross, F2L, OLL, PLL) — the same order PHASE_TINTS uses everywhere else. Full class names so Tailwind sees them. */
const TINT = [
  { solid: "bg-accent", soft: "bg-accent/35" },
  { solid: "bg-cyan", soft: "bg-cyan/35" },
  { solid: "bg-warning", soft: "bg-warning/35" },
  { solid: "bg-success", soft: "bg-success/35" },
] as const;

function tintIndex(row: PostSolvePhaseRow): number {
  if (row.label === "Cross") return 0;
  if (row.f2lPairIndex !== null) return 1;
  return row.group === "OLL" ? 2 : 3;
}

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
    <span className="flex min-w-0 flex-col gap-1">
      <span className="break-words font-mono text-[12px] leading-5 text-foreground/90">{exec.mergedAlg}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {!exec.oneLook ? (
          <span className="font-semibold rc-t-slow">two looks</span>
        ) : mine ? (
          <span>{mine.book ? "book alg" : "your alg"}</span>
        ) : null}
        {pb ? (
          <span className="font-semibold rc-t-good">best execution yet</span>
        ) : mine && mine.count >= 2 ? (
          <span>usually {secs(mine.meanExecMs)}s to execute</span>
        ) : null}
        {offerMain && (
          <button type="button" onClick={() => choose(key, exec.mergedAlg)} className="rc-pill-btn hit-y">
            Use as main alg
          </button>
        )}
      </span>
      {/* The case itself, not the algorithm, two solves of the same case can use two different algs. */}
      {caseRecord && caseRecord.count >= 2 && (
        <span>
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
    <span className="rc-detail-line">
      {TURNS(turns)} · optimal {optimal === turns ? "nice" : `was ${optimal}`}
    </span>
  );
}

/**
 * Under the Cross row: whether your own lifetime numbers say a different
 * cross colour would pay off — the Cross Color Advisor's own question
 * (`/crosscolor`), reused here instead of asking it again from scratch on
 * every solve. Silent unless the gap is the same size the Advisor itself
 * treats as meaningful.
 */
function CrossAdvisorLine({ report }: { report: CrossAdvisorReport | null }) {
  if (!report || report.best.face === report.current.face) return null;
  const gap = report.current.avgLen - report.best.avgLen;
  if (gap < 0.3) return null;
  return (
    <Link href="/crosscolor" className="rc-link">
      a {report.best.colorName} cross usually runs {gap.toFixed(2)} moves shorter for you, Cross Color Advisor
    </Link>
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
    <span className="rc-detail-line" data-tone={extra >= 2 ? "warn" : undefined}>
      {TURNS(turns)} · you usually take {stat.meanTurns.toFixed(1)} for this
    </span>
  );
}

/**
 * Under an OLL/PLL/F2L row: how long you paused to recognise this exact case
 * here, against how long you usually take for it — the phase-level "vs pace"
 * column already says this step ran fast or slow overall; this says whether
 * that was the read or the turning, and whether it's this case in particular
 * that always costs you a beat.
 */
function RecognitionLine({ pausedMs, stat }: { pausedMs: number; stat?: RecognitionStat }) {
  if (pausedMs <= 0 || !stat || stat.count < 3) return null;
  const extraMs = pausedMs - stat.meanMs;
  return (
    <span className="rc-detail-line" data-tone={extraMs >= 500 ? "warn" : undefined}>
      recognised in {secs(pausedMs)}s · usually {secs(stat.meanMs)}s for this
    </span>
  );
}

/**
 * All-time history for the row notes, worked out in idle time: the recap
 * paints at once with whatever the last pass found (nothing, the first time),
 * and the notes catch up a moment later. Each solve is only ever replayed
 * once (the analyses cache per solve), so after a save the catch-up is just
 * the new solve.
 */
function useHistoryStats(solves: readonly Solve[]): HistoryStats {
  const [stats, setStats] = useState<HistoryStats>(NO_HISTORY);
  useEffect(() => scheduleHistoryStats(solves, setStats), [solves]);
  return stats;
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
  const { caseHistory, f2lHistory, recogHistory, crossAdvisor } = useHistoryStats(allSolves);
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
  const router = useRouter();

  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const maxWithMedians = Math.max(max, ...rows.map((_, i) => baseline?.segments[i]?.medianMs ?? 0));

  return (
    <RecapCard>
      <div className="rc-rows">
        {views.map(({ row, icon, caseName, f2lKey, f2lTurns, caseLink }, i) => {
          const look = row.recognitionMs ?? 0;
          const turn = row.executionMs ?? row.totalMs ?? 0;
          const seg = baseline?.segments[i] ?? null;
          const pace = paceFor(row.totalMs, seg);
          const tint = TINT[tintIndex(row)];
          const turns = row.atMs !== null ? moves.filter((m) => m.timeStampMs > (row.startMs ?? -Infinity) && m.timeStampMs <= row.atMs!).length : null;
          const exec = row.group ? executions.find((e) => e.step === row.group) : undefined;
          const recogStat = caseLink ? recogHistory.get(`${caseLink.group}:${caseLink.key}`) : undefined;
          const f2lStat = f2lKey ? f2lHistory.get(f2lKey) : undefined;

          // The single most useful thing to say about this step, if anything — the rest waits behind the chevron.
          let note: { text: string; tone: "good" | "warn" } | null = null;
          if (row.label === "Cross" && crossOptimal !== null && crossTurns !== null && crossTurns > 0 && crossTurns === crossOptimal) note = { text: "optimal", tone: "good" };
          else if (f2lKey && f2lTurns !== null && f2lStat && f2lStat.count >= 3 && f2lTurns - f2lStat.meanTurns >= 2) note = { text: `+${Math.round(f2lTurns - f2lStat.meanTurns)} turns`, tone: "warn" };
          else if (exec && !exec.oneLook) note = { text: "two looks", tone: "warn" };
          else if (row.recognitionMs !== null && recogStat && recogStat.count >= 3 && row.recognitionMs - recogStat.meanMs >= 500) note = { text: "slow read", tone: "warn" };
          else if (exec) {
            const mine = seen[myAlgKey(exec.step, exec.caseName)]?.find((x) => normalizedAlg(x.alg) === normalizedAlg(exec.mergedAlg));
            if (mine && mine.count >= 2 && exec.executionMs <= mine.bestExecMs) note = { text: "best execution", tone: "good" };
          }

          const delta = row.totalMs !== null && seg && seg.medianMs > 0 ? row.totalMs - seg.medianMs : null;
          const showDelta = delta !== null && Math.abs(delta) >= 50;
          const isOpen = open.has(row.label);
          const detailId = `pst-${i}`;
          const hasDetail = !!exec || row.label === "Cross" || !!caseLink || !!caseName;
          return (
            <div key={row.label} className="rc-row">
              <button
                type="button"
                onClick={() => toggle(row.label)}
                aria-expanded={isOpen}
                aria-controls={detailId}
                aria-label={`${isOpen ? "Hide" : "Show"} details for ${row.label}`}
                aria-describedby={`${detailId}-time`}
                className="rc-head"
              >
                <span className="rc-icon">{icon}</span>
                <span className="rc-main">
                  <span className="rc-title">
                    <span className={cn("rc-title-label", row.totalMs === null && "!text-muted-2")}>{row.label}</span>
                    {caseName && <span className="rc-title-case">{caseName}</span>}
                  </span>
                  {/* look (soft) then turn (solid) in this step's own hue; the tick is where you usually finish it */}
                  <span className="rc-track" aria-hidden="true">
                    <span className="rc-fill">
                      <span className={cn("block h-full", tint.soft)} style={{ width: `${(look / maxWithMedians) * 100}%` }} />
                      <span className={cn("block h-full", tint.solid)} style={{ width: `${(turn / maxWithMedians) * 100}%` }} />
                    </span>
                    {seg && seg.medianMs > 0 && (
                      <span
                        title={`Your usual: ${formatTime(seg.medianMs)}`}
                        className="rc-tick"
                        style={{ left: `calc(${(Math.min(seg.medianMs, maxWithMedians) / maxWithMedians) * 100}% - 1px)` }}
                      />
                    )}
                  </span>
                  <span className="rc-meta">
                    {turns !== null && turns > 0 && <span className="whitespace-nowrap">{TURNS(turns)}</span>}
                    {row.recognitionMs !== null && row.executionMs !== null && (
                      <>
                        <span className="whitespace-nowrap">look {secs(row.recognitionMs)}</span>
                        <span className="whitespace-nowrap">turn {secs(row.executionMs)}</span>
                      </>
                    )}
                    {note && (
                      <span className="rc-chip" data-tone={note.tone}>
                        {note.tone === "good" ? <Check size={11} aria-hidden="true" strokeWidth={3} /> : <TriangleAlert size={11} aria-hidden="true" />}
                        {note.text}
                      </span>
                    )}
                  </span>
                </span>
                <span
                  id={`${detailId}-time`}
                  className="rc-time"
                  title={pace === "fast" ? "One of your better ones for this step" : pace === "slow" ? "Slower than usual for this step" : undefined}
                >
                  <span className={cn("rc-time-value", row.totalMs === null && "!text-muted-2")}>{row.totalMs === null ? "—" : formatTime(row.totalMs)}</span>
                  {showDelta && <Delta ms={delta} dir={pace === "fast" ? "fast" : pace === "slow" ? "slow" : "flat"} />}
                </span>
                <ChevronDown size={16} className="rc-chev" aria-hidden="true" />
              </button>
              <Collapse open={isOpen} id={detailId}>
                <div className="rc-detail">
                  {caseLink && caseName && (
                    <button type="button" onClick={() => router.push(`/cases?case=${encodeURIComponent(caseLink.key)}&group=${caseLink.group}`)} className="rc-link text-left" title={`See every time you've had ${caseName}`}>
                      {caseName} · every time you&apos;ve had it
                    </button>
                  )}
                  {!caseLink && caseName && <span className="rc-detail-line">{caseName}</span>}
                  {exec && <AlgLine exec={exec} seen={seen[myAlgKey(exec.step, exec.caseName)]} caseRecord={caseName ? caseHistory.get(caseName) : undefined} />}
                  {row.label === "Cross" && crossTurns !== null && crossOptimal !== null && <CrossEfficiencyLine turns={crossTurns} optimal={crossOptimal} />}
                  {row.label === "Cross" && <CrossAdvisorLine report={crossAdvisor} />}
                  {f2lKey && f2lTurns !== null && <F2lEfficiencyLine turns={f2lTurns} stat={f2lStat} />}
                  {caseLink && row.recognitionMs !== null && <RecognitionLine pausedMs={row.recognitionMs} stat={recogStat} />}
                  {!hasDetail && <span className="rc-detail-line">Nothing more to say about this one.</span>}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
      <p className="rc-legend">
        <span>
          <span className="rc-swatch" style={{ opacity: 0.35 }} /> looking
        </span>
        <span>
          <span className="rc-swatch" /> turning
        </span>
        {baseline && (
          <span>
            <span className="rc-swatch" style={{ width: 2, height: 14, borderRadius: 1 }} /> your usual
          </span>
        )}
      </p>
    </RecapCard>
  );
}
