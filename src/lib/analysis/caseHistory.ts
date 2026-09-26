import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { replayStates } from "@/lib/xray/common";
import { isOllSkip, isPllSkip, recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { pairSegments } from "@/lib/blindspots/blindSpots";
import { recognizeF2lCase } from "@/lib/analysis/f2lCase";
import { simplify } from "@/lib/smartcube/route";
import { PAUSE_MS } from "@/lib/analytics/pause";
import type { Solve } from "@/types";
import { analysisFrame } from "@/lib/smartcube/crossFrame";

/**
 * Every OLL, PLL and F2L case you've met, from every smart-cube solve with
 * a reconstruction and per-move timing — replayed from the moves, so it
 * covers solves recorded before this page existed.
 *
 * Each occurrence is split the same way the post-solve table splits it:
 * recognition is the pause from the previous step finishing to your first
 * turn on this one; execution is from that turn to this step finishing.
 */

export type CaseGroup = "OLL" | "PLL" | "F2L";

export interface CaseOccurrence {
  group: CaseGroup;
  /** OLL/PLL: the library case name. F2L: the recognised case key. */
  key: string;
  name: string;
  solveId: string;
  date: number;
  recognitionMs: number;
  executionMs: number;
  /** Turns executed on this step (same-face quarter turns merged, so a smart cube's D D counts as one D2). */
  turns: number;
  /** Time inside the execution spent in pauses (gaps of PAUSE_MS or more) — a second look, a lost piece. */
  execPauseMs: number;
  /** F2L only: how to draw it. */
  f2l?: { facelets: string; pairFacelets: number[] };
}

export interface CaseStat {
  group: CaseGroup;
  key: string;
  name: string;
  count: number;
  /** Share of your solves (OLL/PLL) or pairs (F2L) that were this case. */
  share: number;
  recognitionMs: number;
  executionMs: number;
  totalMs: number;
  bestTotalMs: number;
  lastSeen: number;
  /** Most recent first. */
  occurrences: CaseOccurrence[];
  f2l?: { facelets: string; pairFacelets: number[] };
}

/** One solve's cases, or [] when it lacks a usable reconstruction. */
export function solveCases(raw: Solve): CaseOccurrence[] {
  if (!raw.scramble || !raw.reconstruction || !raw.moveTimestamps || raw.penalty === "dnf") return [];
  const solve = analysisFrame(raw) as Solve & { reconstruction: string; moveTimestamps: number[] };
  const moves = solve.reconstruction.split(/\s+/).filter(Boolean);
  const t = solve.moveTimestamps;
  if (moves.length !== t.length || moves.length < 10) return [];
  const { after } = replayStates(solve.scramble, moves);
  if (!after[after.length - 1].isSolved()) return [];
  const out: CaseOccurrence[] = [];
  const base = { solveId: solve.id, date: solve.date };
  /** Turns from the move after `from` through `to`, merged the same way the rest of the app counts turns. */
  const turnsBetween = (from: number, to: number) => simplify(moves.slice(from + 1, to + 1)).length;
  /** Pauses between the first turn after `from` and the move at `to`. */
  const pausesBetween = (from: number, to: number) => {
    let ms = 0;
    for (let i = from + 2; i <= to; i++) if (t[i] - t[i - 1] >= PAUSE_MS) ms += t[i] - t[i - 1];
    return ms;
  };

  for (const seg of pairSegments({ scramble: solve.scramble, moves, timesMs: t })) {
    const c = recognizeF2lCase(after[seg.fromIndex], seg.pair as 0 | 1 | 2 | 3);
    if (!c) continue;
    out.push({ ...base, group: "F2L", key: c.key, name: c.name, recognitionMs: seg.findMs, executionMs: seg.execMs, turns: turnsBetween(seg.fromIndex, seg.toIndex), execPauseMs: pausesBetween(seg.fromIndex, seg.toIndex), f2l: { facelets: c.facelets, pairFacelets: c.pairFacelets } });
  }

  const f2lDone = after.findIndex((c) => bottomLayerSolved(c));
  if (f2lDone < 0) return out;
  let ollDone = -1;
  for (let i = f2lDone; i < after.length; i++) {
    if (bottomLayerSolved(after[i]) && orientationSolved(after[i])) {
      ollDone = i;
      break;
    }
  }
  const last = after.length - 1;
  /** Recognition from the step finishing at `from` to the next turn; execution from there to `to`. */
  const split = (from: number, to: number) => ({ recognitionMs: t[from + 1] - t[from], executionMs: t[to] - t[from + 1], turns: turnsBetween(from, to), execPauseMs: pausesBetween(from, to) });

  if (ollDone > f2lDone) {
    const lib = toLibraryFrame(after[f2lDone]);
    const match = isOllSkip(lib) ? null : recognizeOll(lib);
    if (match) out.push({ ...base, group: "OLL", key: match.case.name, name: match.case.name, ...split(f2lDone, ollDone) });
  }
  if (ollDone >= 0 && last > ollDone) {
    const lib = toLibraryFrame(after[ollDone]);
    const match = isPllSkip(lib) ? null : recognizePll(lib);
    if (match) out.push({ ...base, group: "PLL", key: match.case.name, name: match.case.name, ...split(ollDone, last) });
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Per-case stats for one group, most frequent first. `total` is how many solves (OLL/PLL) or pairs (F2L) the shares are out of. */
export function caseStats(occurrences: readonly CaseOccurrence[], group: CaseGroup, total: number): CaseStat[] {
  const byKey = new Map<string, CaseOccurrence[]>();
  for (const o of occurrences) {
    if (o.group !== group) continue;
    const list = byKey.get(o.key) ?? [];
    list.push(o);
    byKey.set(o.key, list);
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.date - a.date);
      const totals = list.map((o) => o.recognitionMs + o.executionMs);
      return {
        group,
        key,
        name: list[0].name,
        count: list.length,
        share: total > 0 ? list.length / total : 0,
        recognitionMs: mean(list.map((o) => o.recognitionMs)),
        executionMs: mean(list.map((o) => o.executionMs)),
        totalMs: mean(totals),
        bestTotalMs: Math.min(...totals),
        lastSeen: sorted[0].date,
        occurrences: sorted,
        f2l: list[0].f2l,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
