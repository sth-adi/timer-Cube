import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { crossSolved, mean, replayStates, type XraySolveInput } from "@/lib/xray/common";

/**
 * AUF Audit. Adjusting the last layer — before OLL, before PLL, and the
 * final turn that finishes the solve — is pure overhead: no pieces get
 * solved, yet every solve pays for it. On a smart cube the app can see
 * each of those turns and the pause before it, so it can price them: how
 * long you hesitate before the final AUF (which is knowable before your
 * PLL even ends), and how often an AUF goes the long way round
 * (U U U instead of U', or overshooting and coming back).
 *
 * Engine frame: the last layer is the yellow D face, so an AUF is a run of
 * D turns — shown to the cuber as U, since yellow is on top in their hands.
 */

export type AufStage = "preOll" | "prePll" | "final";
export const AUF_STAGES: readonly AufStage[] = ["preOll", "prePll", "final"];
export const AUF_STAGE_LABEL: Record<AufStage, string> = {
  preOll: "Before OLL",
  prePll: "Before PLL",
  final: "Final AUF",
};

export interface AufEvent {
  stage: AufStage;
  /** Physical D turns, as reported. */
  tokens: string[];
  /** Net clockwise quarter turns (mod 4). */
  net: number;
  usedQuarters: number;
  wastedQuarters: number;
  /** The pause right before the first AUF turn. */
  waitMs: number;
  /** First AUF turn to last. */
  turnMs: number;
}

export interface SolveAuf {
  /** Stages that happened in this solve (a skipped OLL has no pre-OLL stage), each with its AUF or null if none was needed. */
  stages: { stage: AufStage; event: AufEvent | null }[];
}

const quarters = (t: string) => (t.endsWith("2") ? 2 : 1);
const signed = (t: string) => (t.endsWith("2") ? 2 : t.endsWith("'") ? 3 : 1);
const MINIMAL = [0, 1, 2, 1];

/** How the cuber sees an AUF: with yellow on top the D face is their U. */
export function aufLabel(net: number): string {
  return ["none", "U", "U2", "U'"][net];
}

function event(stage: AufStage, moves: readonly string[], timesMs: readonly number[], from: number, to: number): AufEvent {
  const tokens = moves.slice(from, to + 1);
  const net = tokens.reduce((s, t) => (s + signed(t)) % 4, 0);
  const usedQuarters = tokens.reduce((s, t) => s + quarters(t), 0);
  return {
    stage,
    tokens,
    net,
    usedQuarters,
    wastedQuarters: usedQuarters - MINIMAL[net],
    waitMs: from > 0 ? timesMs[from] - timesMs[from - 1] : 0,
    turnMs: timesMs[to] - timesMs[from],
  };
}

const isD = (t: string | undefined) => t !== undefined && t[0] === "D";

/** The AUFs of one solve, or null if it wasn't a finished CFOP solve. */
export function solveAufs({ scramble, moves, timesMs }: XraySolveInput): SolveAuf | null {
  if (moves.length === 0 || timesMs.length !== moves.length) return null;
  const { start, after } = replayStates(scramble, moves);
  // States by "moves applied": 0 = the scramble, k = after moves[k - 1].
  const state = (k: number) => (k === 0 ? start : after[k - 1]);
  if (!after[after.length - 1].isSolved()) return null;
  const n = moves.length;
  let f2l = -1;
  for (let k = 0; k <= n; k++) {
    if (crossSolved(state(k)) && bottomLayerSolved(state(k))) {
      f2l = k;
      break;
    }
  }
  if (f2l < 0) return null;
  let oll = f2l;
  while (oll <= n && !(bottomLayerSolved(state(oll)) && orientationSolved(state(oll)))) oll++;

  const runFrom = (k: number) => {
    let j = k;
    while (j < n && isD(moves[j])) j++;
    return j - 1; // last index of the D run starting at move index k (k - 1 if none)
  };

  const stages: SolveAuf["stages"] = [];
  if (oll > f2l) {
    const end = runFrom(f2l);
    stages.push({ stage: "preOll", event: end >= f2l ? event("preOll", moves, timesMs, f2l, end) : null });
  }
  // The final AUF: the D run the solve ends on.
  let finalFrom = n;
  while (finalFrom > oll && isD(moves[finalFrom - 1])) finalFrom--;
  if (oll < n) {
    // When everything after OLL is AUF (a PLL skip) that run is the final
    // AUF (finalFrom === oll), and there's no separate pre-PLL stage.
    const end = runFrom(oll);
    if (end < finalFrom) stages.push({ stage: "prePll", event: end >= oll ? event("prePll", moves, timesMs, oll, end) : null });
  }
  stages.push({ stage: "final", event: finalFrom < n ? event("final", moves, timesMs, finalFrom, n - 1) : null });
  return { stages };
}

export interface AufStageStats {
  stage: AufStage;
  samples: number;
  neededRate: number;
  avgWaitMs: number | null;
  avgTurnMs: number | null;
  /** Share of needed AUFs that used more quarter turns than necessary. */
  wastedRate: number;
  byNet: Record<string, number>;
}

export interface AufReport {
  solves: number;
  stages: AufStageStats[];
  /** Mean ms per solve spent turning AUFs plus waiting before the final one. */
  avgOverheadMs: number;
  insights: string[];
}

export function buildAufReport(perSolve: readonly (SolveAuf | null)[]): AufReport | null {
  const solves = perSolve.filter((s): s is SolveAuf => s !== null);
  if (solves.length === 0) return null;
  const stages = AUF_STAGES.map((stage): AufStageStats => {
    const entries = solves.flatMap((s) => s.stages.filter((x) => x.stage === stage));
    const needed = entries.map((e) => e.event).filter((e): e is AufEvent => e !== null);
    const byNet: Record<string, number> = {};
    for (const e of needed) byNet[aufLabel(e.net)] = (byNet[aufLabel(e.net)] ?? 0) + 1;
    return {
      stage,
      samples: entries.length,
      neededRate: entries.length ? needed.length / entries.length : 0,
      avgWaitMs: mean(needed.map((e) => e.waitMs)),
      avgTurnMs: mean(needed.map((e) => e.turnMs)),
      wastedRate: needed.length ? needed.filter((e) => e.wastedQuarters > 0).length / needed.length : 0,
      byNet,
    };
  });
  const overhead = solves.map((s) =>
    s.stages.reduce((sum, x) => sum + (x.event ? x.event.turnMs + (x.stage === "final" ? x.event.waitMs : 0) : 0), 0),
  );
  const avgOverheadMs = mean(overhead) ?? 0;

  const insights: string[] = [];
  const final = stages[2];
  if (final.avgWaitMs !== null && final.avgWaitMs > 250) {
    insights.push(
      `You pause ${(final.avgWaitMs / 1000).toFixed(2)}s before the final AUF. Which way it goes is decided before your PLL ends — watch one side block during the alg and flow straight into it.`,
    );
  }
  const allNeeded = stages.reduce((s, x) => s + x.samples * x.neededRate, 0);
  const allWasted = stages.reduce((s, x) => s + x.samples * x.neededRate * x.wastedRate, 0);
  if (allNeeded >= 5 && allWasted / allNeeded > 0.12) {
    insights.push(
      `${Math.round((allWasted / allNeeded) * 100)}% of your AUFs take extra turns — U U U instead of U', or overshooting and coming back. Decide the direction before you turn.`,
    );
  }
  const prePll = stages[1];
  if (prePll.avgWaitMs !== null && prePll.avgTurnMs !== null && prePll.avgWaitMs > 600) {
    insights.push(
      `Before PLL you look for ${(prePll.avgWaitMs / 1000).toFixed(2)}s, then adjust. Learning to recognise PLL from any angle lets you do the AUF and the alg without that stop.`,
    );
  }
  if (insights.length === 0) insights.push("Your AUFs are clean: little hesitation and no wasted turns.");
  return { solves: solves.length, stages, avgOverheadMs, insights };
}
