import type { Solve } from "@/types";
import { quantile } from "@/lib/analytics/solveMetrics";
import { solveCases, type CaseOccurrence } from "@/lib/analysis/caseHistory";

/**
 * F2L Case Consistency: for every F2L case you've met a few times, how many
 * turns you usually take against the fewest you've ever done it in. A case
 * you've solved in 7 turns but usually take 12 on is one you don't have a
 * fixed algorithm for — you're working it out fresh each time. The
 * benchmark is your own best, so every "turns you could save" is something
 * you've already done at least once.
 */

export interface F2lCaseSpread {
  key: string;
  name: string;
  count: number;
  medianTurns: number;
  bestTurns: number;
  medianMs: number;
  /** Turns over your best, on a typical occurrence. */
  spread: number;
  /** Median ms per turn on this case's execution — what one extra turn costs here. */
  msPerTurn: number;
  /** spread × msPerTurn × how often it comes up per solve — the time this case's inconsistency costs you per solve. */
  lostMsPerSolve: number;
  f2l?: CaseOccurrence["f2l"];
}

export interface F2lConsistencyReport {
  solves: number;
  pairs: number;
  medianTurnsPerPair: number;
  cases: F2lCaseSpread[];
  /** The cases worth learning a fixed algorithm for, costliest first. */
  worst: F2lCaseSpread[];
  lostMsPerSolve: number;
  headline: string;
}

export const MIN_OCCURRENCES = 3;
export const MIN_SOLVES = 10;
/** A case whose typical solve is within this many turns of your best is already consistent. */
const CONSISTENT_WITHIN = 2;

/** Pure aggregation over already-extracted F2L occurrences, so it's testable without replaying solves. */
export function summarizeF2lConsistency(occurrences: readonly CaseOccurrence[], solveCount: number): F2lConsistencyReport | null {
  const f2l = occurrences.filter((o) => o.group === "F2L" && o.turns > 0);
  if (solveCount < MIN_SOLVES || f2l.length === 0) return null;

  const byKey = new Map<string, CaseOccurrence[]>();
  for (const o of f2l) byKey.set(o.key, [...(byKey.get(o.key) ?? []), o]);

  const cases: F2lCaseSpread[] = [...byKey.values()]
    .filter((list) => list.length >= MIN_OCCURRENCES)
    .map((list) => {
      const turns = list.map((o) => o.turns);
      const medianTurns = quantile(turns, 0.5);
      const bestTurns = Math.min(...turns);
      const spread = Math.max(0, medianTurns - bestTurns);
      const msPerTurn = quantile(
        list.map((o) => o.executionMs / Math.max(1, o.turns)),
        0.5,
      );
      return {
        key: list[0].key,
        name: list[0].name,
        count: list.length,
        medianTurns,
        bestTurns,
        medianMs: quantile(
          list.map((o) => o.recognitionMs + o.executionMs),
          0.5,
        ),
        spread,
        msPerTurn,
        lostMsPerSolve: (spread * msPerTurn * list.length) / solveCount,
        f2l: list[0].f2l,
      };
    })
    .sort((a, b) => b.lostMsPerSolve - a.lostMsPerSolve);
  if (cases.length === 0) return null;

  const worst = cases.filter((c) => c.spread > CONSISTENT_WITHIN).slice(0, 5);
  const lostMsPerSolve = worst.reduce((s, c) => s + c.lostMsPerSolve, 0);
  const medianTurnsPerPair = quantile(
    f2l.map((o) => o.turns),
    0.5,
  );

  const parts = [`Your F2L pairs take ${medianTurnsPerPair.toFixed(0)} turns on a typical pair.`];
  if (worst.length) {
    const w = worst[0];
    parts.push(`"${w.name}" is the least settled: you've done it in ${w.bestTurns} turns but usually take ${w.medianTurns.toFixed(0)}.`);
    parts.push(`Learning one fixed algorithm for your ${worst.length === 1 ? "worst case" : `${worst.length} least-settled cases`} is worth about ${(lostMsPerSolve / 1000).toFixed(2)}s a solve.`);
  } else {
    parts.push("Every case you see often is within a couple of turns of your best — your F2L algorithms are settled.");
  }

  return { solves: solveCount, pairs: f2l.length, medianTurnsPerPair, cases, worst, lostMsPerSolve, headline: parts.join(" ") };
}

export function analyzeF2lConsistency(solves: readonly Solve[]): F2lConsistencyReport | null {
  const perSolve = solves.map(solveCases).filter((c) => c.length > 0);
  return summarizeF2lConsistency(perSolve.flat(), perSolve.length);
}
