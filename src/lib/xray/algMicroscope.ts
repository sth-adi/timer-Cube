import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { YELLOW_TOP_GRIPS, inGrip, mean, median, replayStates, type XraySolveInput } from "./common";

/**
 * Alg Microscope. Every OLL and PLL you do on a smart cube is recorded turn
 * by turn with real timestamps — so the app can see not just *that* you
 * solved a T-perm, but *which* T-perm algorithm you actually used, and how
 * long every single turn inside it took. Across your history that exposes
 * things no stopwatch can:
 *
 *  - the algorithm(s) you really execute for each case, written out in
 *    standard yellow-top notation (auto-detected — you might be using two
 *    different Y-perms without realizing);
 *  - your recognition time per case, separate from execution;
 *  - a per-turn timing profile for each algorithm, pinpointing the exact
 *    turn where your hands stall (a bad regrip, an awkward F', a lockup).
 *
 * Algorithms are normalized so the same algorithm reads the same whichever
 * side you did it from: re-expressed with yellow on top and the whole
 * sequence rotated about the vertical axis so its first side turn is R —
 * which is how nearly every OLL/PLL is written.
 */

export type LastLayerStep = "OLL" | "PLL";

export interface AlgExecution {
  step: LastLayerStep;
  caseName: string;
  /** Canonical yellow-top notation of the executed algorithm (without AUFs). */
  alg: string;
  tokens: string[];
  /** Ms from the phase starting (previous step done) to the algorithm's first turn — includes any pre-AUF. */
  recognitionMs: number;
  /** Ms from the algorithm's first turn to its last. */
  executionMs: number;
  /** Ms before each turn of the algorithm (index 0 is always 0 — the first turn starts the clock). */
  gaps: number[];
  date: number;
}

/** Algorithms outside this length range are almost certainly multi-look or a botched execution, not "your algorithm". */
const MIN_ALG_TURNS = 3;
const MAX_ALG_TURNS = 20;
/** A turn this many times slower than the algorithm's typical turn is a stall. */
export const STALL_RATIO = 1.7;

/** In the engine frame the yellow layer is D, so D turns are the solver's AUFs. */
const isAuf = (token: string) => token[0] === "D";

/** Rewrites engine-frame turns as yellow-top notation, choosing the y-rotation that makes the first side turn an R. */
export function canonicalAlg(tokens: readonly string[]): string[] {
  const firstSide = tokens.findIndex((t) => t[0] !== "U" && t[0] !== "D");
  for (const grip of YELLOW_TOP_GRIPS) {
    const mapped = inGrip(tokens, grip);
    if (firstSide < 0 || mapped[firstSide][0] === "R") return mapped;
  }
  return inGrip(tokens, YELLOW_TOP_GRIPS[0]);
}

export function extractAlgExecutions(input: XraySolveInput & { date?: number }): AlgExecution[] {
  const { scramble, moves, timesMs } = input;
  const { after } = replayStates(scramble, moves);
  const f2lIdx = after.findIndex((c) => bottomLayerSolved(c));
  if (f2lIdx < 0) return [];
  const ollIdx = after.findIndex((c, i) => i >= f2lIdx && bottomLayerSolved(c) && orientationSolved(c));
  const solvedIdx = after.length - 1;
  if (ollIdx < 0 || !after[solvedIdx].isSolved()) return [];
  const t = (i: number) => timesMs[i] ?? 0;
  const out: AlgExecution[] = [];

  const take = (step: LastLayerStep, phaseStart: number, phaseEnd: number) => {
    if (phaseEnd <= phaseStart) return; // a skip
    let first = phaseStart + 1;
    let last = phaseEnd;
    while (first <= last && isAuf(moves[first])) first++;
    if (step === "PLL") while (last >= first && isAuf(moves[last])) last--;
    const tokens = moves.slice(first, last + 1);
    if (tokens.length < MIN_ALG_TURNS || tokens.length > MAX_ALG_TURNS) return;
    const library = toLibraryFrame(after[phaseStart]);
    const caseName = (step === "OLL" ? recognizeOll(library) : recognizePll(library))?.case.name;
    if (!caseName) return;
    out.push({
      step,
      caseName,
      alg: canonicalAlg(tokens).join(" "),
      tokens: canonicalAlg(tokens),
      recognitionMs: t(first) - t(phaseStart),
      executionMs: t(last) - t(first),
      gaps: tokens.map((_, k) => (k === 0 ? 0 : t(first + k) - t(first + k - 1))),
      date: input.date ?? 0,
    });
  };
  take("OLL", f2lIdx, ollIdx);
  take("PLL", ollIdx, solvedIdx);
  return out;
}

export interface VariantProfile {
  alg: string;
  tokens: string[];
  count: number;
  meanExecMs: number;
  bestExecMs: number;
  /** Mean ms before each turn across executions (index 0 = 0). */
  meanGaps: number[];
  /** The turn your hands stall on, if one clearly stands out. */
  stall: { index: number; token: string; ms: number; ratio: number } | null;
}

export interface CaseProfile {
  step: LastLayerStep;
  caseName: string;
  count: number;
  meanRecognitionMs: number;
  meanExecMs: number;
  variants: VariantProfile[];
}

export function profileVariant(executions: readonly AlgExecution[]): VariantProfile {
  const tokens = executions[0].tokens;
  const meanGaps = tokens.map((_, k) => mean(executions.map((e) => e.gaps[k])) ?? 0);
  const typical = median(meanGaps.slice(1)) ?? 0;
  let stall: VariantProfile["stall"] = null;
  if (typical > 0) {
    for (let k = 1; k < meanGaps.length; k++) {
      const ratio = meanGaps[k] / typical;
      if (ratio >= STALL_RATIO && (!stall || ratio > stall.ratio)) stall = { index: k, token: tokens[k], ms: meanGaps[k], ratio };
    }
  }
  const execs = executions.map((e) => e.executionMs);
  return {
    alg: executions[0].alg,
    tokens,
    count: executions.length,
    meanExecMs: mean(execs) ?? 0,
    bestExecMs: Math.min(...execs),
    meanGaps,
    stall,
  };
}

/** Groups every execution into per-case profiles, slowest total (recognition + execution) first. */
export function buildMicroscope(executions: readonly AlgExecution[]): CaseProfile[] {
  const byCase = new Map<string, AlgExecution[]>();
  for (const e of executions) {
    const key = `${e.step}:${e.caseName}`;
    byCase.set(key, [...(byCase.get(key) ?? []), e]);
  }
  const cases: CaseProfile[] = [];
  for (const list of byCase.values()) {
    const byAlg = new Map<string, AlgExecution[]>();
    for (const e of list) byAlg.set(e.alg, [...(byAlg.get(e.alg) ?? []), e]);
    cases.push({
      step: list[0].step,
      caseName: list[0].caseName,
      count: list.length,
      meanRecognitionMs: mean(list.map((e) => e.recognitionMs)) ?? 0,
      meanExecMs: mean(list.map((e) => e.executionMs)) ?? 0,
      variants: [...byAlg.values()].map(profileVariant).sort((a, b) => b.count - a.count || a.meanExecMs - b.meanExecMs),
    });
  }
  return cases.sort((a, b) => b.meanRecognitionMs + b.meanExecMs - (a.meanRecognitionMs + a.meanExecMs));
}
