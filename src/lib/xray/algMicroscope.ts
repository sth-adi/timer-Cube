import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import type { CubeJSInstance } from "@/lib/cube-engine/engine";
import { LOOK_PAUSE_MS } from "@/lib/analysis/mistakeRadar";
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
  /**
   * Done as one algorithm — not two looks (edges then corners for OLL,
   * corners then edges for PLL) with a stop or an AUF in between.
   */
  oneLook: boolean;
  /** No turn undone by the next one (R R') — a clean execution, not a fumble. */
  clean: boolean;
  /** `alg` with smart-cube quarter turns merged (R R → R2), as you'd write it. */
  mergedAlg: string;
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

/**
 * The same algorithm the way a person would write it: of the four ways to
 * hold it (turned about the vertical), the one with the fewest back and
 * left turns — "F R U' R' …", not "R B U' B' …".
 */
export function readableAlg(tokens: readonly string[]): string[] {
  const cost = (ts: readonly string[]) => ts.reduce((n, t) => n + (t[0] === "B" ? 2 : t[0] === "L" ? 1 : 0), 0);
  let best = canonicalAlg(tokens);
  for (const grip of YELLOW_TOP_GRIPS) {
    const mapped = inGrip(tokens, grip);
    if (cost(mapped) < cost(best)) best = mapped;
  }
  return best;
}

const AMOUNT: Record<string, number> = { "": 1, "'": 3, "2": 2 };
const SUFFIX = ["", "", "2", "'"];

/** Consecutive turns of one face merged (R R → R2, R R R → R'); `cancelled` when turns undid each other. */
export function mergeTurns(tokens: readonly string[]): { tokens: string[]; cancelled: boolean } {
  const out: { face: string; amt: number }[] = [];
  let cancelled = false;
  for (const t of tokens) {
    const face = t[0];
    const amt = AMOUNT[t.slice(1)] ?? 1;
    const top = out[out.length - 1];
    if (top && top.face === face) {
      top.amt = (top.amt + amt) % 4;
      if (top.amt === 0) {
        out.pop();
        cancelled = true;
      }
    } else out.push({ face, amt });
  }
  return { tokens: out.map((x) => x.face + SUFFIX[x.amt]), cancelled };
}

const LL_CORNERS = [4, 5, 6, 7];
const LL_EDGES = [4, 5, 6, 7];
const AUF_TURNS = ["", "D", "D2", "D'"];

/** Last-layer edges all facing yellow (engine frame: last layer on D). */
const llEdgesOriented = (c: CubeJSInstance) => LL_EDGES.every((s) => c.eo[s] === 0);

/** Whether some turn of the last layer puts all its corners (or edges) in place — permuted relative to each other. */
function llPermuted(c: CubeJSInstance, pieces: "corners" | "edges"): boolean {
  return AUF_TURNS.some((a) => {
    const x = a ? c.clone() : c;
    if (a) x.move(a);
    return pieces === "corners" ? LL_CORNERS.every((s) => x.cp[s] === s) : LL_EDGES.every((s) => x.ep[s] === s);
  });
}

/** The half-way point of a two-look step: OLL edges done but not corners; PLL corners or edges done, not both. */
function halfWay(step: LastLayerStep, c: CubeJSInstance): boolean {
  if (!bottomLayerSolved(c)) return false;
  if (step === "OLL") return llEdgesOriented(c) && !orientationSolved(c);
  return orientationSolved(c) && llPermuted(c, "corners") !== llPermuted(c, "edges");
}

/**
 * Two looks: somewhere inside the step the cube sat at the half-way point
 * of a two-look method — and you stopped there, or turned the top to set
 * up the second algorithm. A one-look algorithm can pass through such a
 * state, but flows straight on through it.
 */
function secondLook(step: LastLayerStep, after: readonly CubeJSInstance[], moves: readonly string[], phaseStart: number, first: number, last: number, t: (i: number) => number): boolean {
  if (halfWay(step, after[phaseStart])) return false; // the case was already half-way: it only ever needed one algorithm
  const gaps: number[] = [];
  for (let k = first + 1; k <= last; k++) gaps.push(t(k) - t(k - 1));
  const typical = median(gaps) ?? 0;
  for (let k = first; k < last; k++) {
    if (!halfWay(step, after[k])) continue;
    const pause = t(k + 1) - t(k);
    if (isAuf(moves[k + 1]) || (pause >= LOOK_PAUSE_MS && pause >= 2 * typical)) return true;
  }
  return false;
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
    const merged = mergeTurns(tokens);
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
      oneLook: !secondLook(step, after, moves, phaseStart, first, last, t),
      clean: !merged.cancelled,
      mergedAlg: readableAlg(merged.tokens).join(" "),
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
