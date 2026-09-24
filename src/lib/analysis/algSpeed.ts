import type { Solve } from "@/types";
import { quantile } from "@/lib/analytics/solveMetrics";
import { findCase } from "@/lib/algorithms/caseLookup";
import { simplify } from "@/lib/smartcube/route";
import { solveCases, type CaseOccurrence } from "@/lib/analysis/caseHistory";

/**
 * Alg Speed Check: for every OLL and PLL you've done a few times, what's
 * slowing it down — and what to do about it. Three different problems get
 * three different verdicts:
 *
 *  - **two-look**: noticeably more turns than the book algorithm *and* a
 *    pause in the middle — you're solving it with two algorithms and a
 *    second look. Fix: learn the one-look algorithm.
 *  - **hesitates**: about the book's turn count, but with a stop partway
 *    through — the algorithm isn't fully in your fingers yet. Fix: drill it
 *    until it runs without stopping.
 *  - **slow-hands**: turned slower than your usual last-layer pace, with
 *    pauses excluded, so it's purely the fingers. Fix: drill it.
 *  - **long-route**: many more turns than the book with no stop — a longer
 *    algorithm or regrips. Fix: a shorter alg or better fingertricks.
 *
 * Every estimate is against your own pace: a case is "worth" the gap
 * between what it takes you now and the book algorithm turned at your
 * normal last-layer speed.
 */

export type AlgVerdict = "two-look" | "hesitates" | "slow-hands" | "long-route" | "fine";

export interface AlgSpeed {
  group: "OLL" | "PLL";
  name: string;
  count: number;
  /** Turns per second while actually turning (pauses excluded). */
  medianTps: number;
  medianTurns: number;
  /** STM length of the library's algorithm for this case, if it's in the library. */
  bookTurns: number | null;
  medianExecMs: number;
  medianPauseMs: number;
  /** Median execution minus the book alg (or your own turns) at your baseline TPS. */
  savableMs: number;
  lostMsPerSolve: number;
  verdict: AlgVerdict;
}

export interface AlgSpeedReport {
  baselineTps: number;
  algs: AlgSpeed[];
  flagged: AlgSpeed[];
  /** Share of your OLLs done in two looks. */
  twoLookOllShare: number;
  lostMsPerSolve: number;
  headline: string;
}

export const MIN_OCCURRENCES = 3;
export const MIN_SOLVES = 10;
const SLOW_SHARE = 0.85;
const BOOK_SLACK = 3;
/** A pause at least this long in the middle of an algorithm is a second look. */
const MID_LOOK_MS = 300;

/**
 * The book algorithm's length counted the way a smart cube reports it:
 * rotations are free, a wide turn is one face turn, and a slice turn (M, E,
 * S) is two — the cube only sees its two outer faces move.
 */
export function bookTurns(group: "OLL" | "PLL", name: string): number | null {
  const c = findCase(group, name);
  if (!c) return null;
  const tokens = simplify(c.alg.split(/\s+/).filter((t) => t && !/^[xyz]/.test(t)));
  return tokens.reduce((n, t) => n + (/^[MES]/.test(t) ? 2 : 1), 0);
}

const turningTps = (o: CaseOccurrence) => {
  const ms = o.executionMs - o.execPauseMs;
  return ms > 0 ? o.turns / (ms / 1000) : 0;
};

export function classifyAlg(medianTps: number, baselineTps: number, medianTurns: number, book: number | null, medianPauseMs: number): AlgVerdict {
  const longer = book !== null && medianTurns > book + BOOK_SLACK;
  if (longer && medianPauseMs >= MID_LOOK_MS) return "two-look";
  if (medianPauseMs >= MID_LOOK_MS) return "hesitates";
  if (medianTps < baselineTps * SLOW_SHARE) return "slow-hands";
  if (longer) return "long-route";
  return "fine";
}

/** Pure aggregation over already-extracted OLL/PLL occurrences. */
export function summarizeAlgSpeed(occurrences: readonly CaseOccurrence[], solveCount: number): AlgSpeedReport | null {
  const ll = occurrences.filter(
    (o): o is CaseOccurrence & { group: "OLL" | "PLL" } => (o.group === "OLL" || o.group === "PLL") && o.turns > 0 && o.executionMs > o.execPauseMs,
  );
  if (solveCount < MIN_SOLVES || ll.length === 0) return null;
  const baselineTps = quantile(ll.map(turningTps), 0.5);
  if (baselineTps <= 0) return null;

  const byKey = new Map<string, typeof ll>();
  for (const o of ll) byKey.set(`${o.group}:${o.key}`, [...(byKey.get(`${o.group}:${o.key}`) ?? []), o]);

  const algs: AlgSpeed[] = [...byKey.values()]
    .filter((list) => list.length >= MIN_OCCURRENCES)
    .map((list) => {
      const { group, name } = list[0];
      const q = (f: (o: CaseOccurrence) => number) => quantile(list.map(f), 0.5);
      const medianTps = q(turningTps);
      const medianTurns = q((o) => o.turns);
      const medianExecMs = q((o) => o.executionMs);
      const medianPauseMs = q((o) => o.execPauseMs);
      const book = bookTurns(group, name);
      const verdict = classifyAlg(medianTps, baselineTps, medianTurns, book, medianPauseMs);
      // What it would take at your pace: the book alg if you're off-book, your own turns otherwise.
      const idealTurns = verdict === "two-look" || verdict === "long-route" ? (book ?? medianTurns) : medianTurns;
      const savableMs = verdict === "fine" ? 0 : Math.max(0, medianExecMs - (idealTurns / baselineTps) * 1000);
      return { group, name, count: list.length, medianTps, medianTurns, bookTurns: book, medianExecMs, medianPauseMs, savableMs, lostMsPerSolve: (savableMs * list.length) / solveCount, verdict };
    })
    .sort((a, b) => b.lostMsPerSolve - a.lostMsPerSolve);
  if (algs.length === 0) return null;

  const olls = ll.filter((o) => o.group === "OLL");
  const twoLookOlls = olls.filter((o) => {
    const book = bookTurns("OLL", o.name);
    return book !== null && o.turns > book + BOOK_SLACK && o.execPauseMs >= MID_LOOK_MS;
  });
  const twoLookOllShare = olls.length ? twoLookOlls.length / olls.length : 0;

  const flagged = algs.filter((a) => a.verdict !== "fine").slice(0, 8);
  const lostMsPerSolve = flagged.reduce((s, a) => s + a.lostMsPerSolve, 0);
  const s = (ms: number) => (ms / 1000).toFixed(2);

  const parts: string[] = [`While turning, you do last-layer algorithms at ${baselineTps.toFixed(1)} TPS.`];
  if (twoLookOllShare >= 0.5) {
    const top = flagged.filter((a) => a.verdict === "two-look" && a.group === "OLL").slice(0, 3);
    parts.push(`${Math.round(twoLookOllShare * 100)}% of your OLLs take two looks.`);
    if (top.length) parts.push(`Learning full OLL for ${top.map((a) => a.name).join(", ")} first is worth about ${s(top.reduce((x, a) => x + a.lostMsPerSolve, 0))}s a solve.`);
  }
  const stop = flagged.find((a) => a.verdict === "hesitates");
  if (stop) parts.push(`You stop partway through ${stop.name} (${(stop.medianPauseMs / 1000).toFixed(1)}s) — it isn't fully memorized yet.`);
  const hands = flagged.find((a) => a.verdict === "slow-hands");
  if (hands) parts.push(`${hands.name} is your slowest to turn (${hands.medianTps.toFixed(1)} TPS) — worth drilling.`);
  if (!flagged.length) parts.push("No case you do regularly stands out — your last-layer execution is even.");

  return { baselineTps, algs, flagged, twoLookOllShare, lostMsPerSolve, headline: parts.join(" ") };
}

export function analyzeAlgSpeed(solves: readonly Solve[]): AlgSpeedReport | null {
  const perSolve = solves.map(solveCases).filter((c) => c.length > 0);
  return summarizeAlgSpeed(perSolve.flat(), perSolve.length);
}
