/**
 * Compares a reconstruction against what could have been done instead.
 *
 * The comparison is deliberately *local*: for each phase, the reference is the
 * shortest solution from the state the cuber was actually in at that moment,
 * not the corresponding phase of some ideal solve that reached the position a
 * different way. Telling someone their third pair was inefficient only means
 * something if the alternative was available from where they stood.
 */

import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { solveCrossFromCube } from "../solvers/cross";
import { solvePairFromCube } from "../solvers/f2l";
import { solveOLL } from "../solvers/oll";
import { solvePLL } from "../solvers/pll";
import { F2L_PAIRS, type PairId } from "../solvers/data/pieceTablesClient";
import {
  countMoves,
  movesToAlg,
  parseMoves,
  type Move,
  type MoveMetrics,
} from "./notation";
import {
  mapFromSolverFrame,
  mapToLibraryFrame,
  mapToSolverFrame,
  relabelAlg,
  relabelMoves,
  relabelSlotName,
  type Face,
  type TokenMap,
} from "./frames";
import {
  SOLVER_PAIR_NAMES,
  detectCrossFace,
  segmentSolve,
  walkStates,
  type PhaseId,
  type Segment,
} from "./segment";
import { isOllSkip, isPllSkip, recognizeOll, recognizePll } from "./recognize";

export interface AnalyzeInput {
  scramble: string;
  reconstruction: string;
  /** Optional solve time, which unlocks turn-speed findings. */
  timeMs?: number;
}

export interface ModelSolution {
  moves: string[];
  metrics: MoveMetrics;
  /** True when the search is guaranteed shortest, false when it's just a good solution. */
  optimal: boolean;
}

export interface PhaseAnalysis {
  phase: PhaseId;
  label: string;
  /** F2L slot in the cuber's own orientation, e.g. "FR". */
  slot?: string;
  moves: string[];
  metrics: MoveMetrics;
  model: ModelSolution | null;
  /** Extra turns spent versus the model, in STM; null when no model was found. */
  lost: number | null;
  /** Recognized last-layer case, for the OLL and PLL phases. */
  caseName?: string;
  caseAlg?: string;
  caseAlgMoves?: number;
  skipped?: boolean;
}

export type Severity = "high" | "medium" | "low" | "good";

export interface Finding {
  id: string;
  severity: Severity;
  phase?: PhaseId;
  title: string;
  detail: string;
}

export interface SolveAnalysis {
  ok: true;
  scramble: string;
  /** The face the cross was built on, detected from the solve itself. */
  crossFace: Face;
  moves: string[];
  metrics: MoveMetrics;
  phases: PhaseAnalysis[];
  findings: Finding[];
  /** Sum of every phase's model, i.e. how short this solve could plausibly have been. */
  modelStm: number | null;
  cfopShaped: boolean;
  cfopReason?: string;
  timeMs?: number;
  /** Turns per second in ETM, when a time was supplied. */
  tps?: number;
  summary: string;
}

export interface FailedAnalysis {
  ok: false;
  errors: string[];
}

export type AnalyzeResult = SolveAnalysis | FailedAnalysis;

const fail = (...errors: string[]): FailedAnalysis => ({ ok: false, errors });

/** Turns a phase's model move list into a reported solution. */
function toModel(moves: string[] | null, map: TokenMap, optimal: boolean): ModelSolution | null {
  if (!moves) return null;
  const display = moves.map((m) => relabelAlg(m, map));
  return { moves: display, metrics: countMoves(parseMoves(display.join(" ")).moves), optimal };
}

function stateAt(states: readonly CubeJSInstance[], index: number): CubeJSInstance {
  return states[Math.min(index, states.length - 1)].clone();
}

export function analyzeSolve(input: AnalyzeInput): AnalyzeResult {
  const scrambleParse = parseMoves(input.scramble);
  if (scrambleParse.errors.length) {
    return fail(...scrambleParse.errors.map((e) => `Scramble: ${e}`));
  }
  if (scrambleParse.moves.length === 0) return fail("Enter the scramble this solve came from.");

  const solveParse = parseMoves(input.reconstruction);
  if (solveParse.errors.length) {
    return fail(...solveParse.errors.map((e) => `Reconstruction: ${e}`));
  }
  if (solveParse.moves.length === 0) return fail("Enter the moves you used to solve it.");

  const scrambleAlg = movesToAlg(scrambleParse.moves);
  const userMoves = solveParse.moves;

  const rawStates = walkStates(scrambleAlg, userMoves);
  if (!rawStates[rawStates.length - 1].isSolved()) {
    return fail(
      "These moves don't solve that scramble. Check for a missed or mistyped move — " +
        "the analyzer replays the solve on a virtual cube, so it has to finish solved.",
    );
  }

  const crossFace = detectCrossFace(rawStates);
  if (!crossFace) return fail("Couldn't work out which face the cross was built on.");

  // Everything below is computed in the solver's own frame (cross on U), then
  // relabeled back for display, so the existing solvers apply unchanged.
  const toSolver = mapToSolverFrame(crossFace);
  const toUser = mapFromSolverFrame(crossFace);
  const solverMoves = relabelMoves(userMoves, toSolver);
  const solverScramble = relabelAlg(scrambleAlg, toSolver);
  const states = walkStates(solverScramble, solverMoves);

  // A third frame, with the last layer on U, is what every published OLL and
  // PLL algorithm is written in — that's where case recognition happens.
  const toLibrary = mapToLibraryFrame();
  const libraryStates = walkStates(
    relabelAlg(solverScramble, toLibrary),
    relabelMoves(solverMoves, toLibrary),
  );

  const segmentation = segmentSolve(states);
  const metrics = countMoves(userMoves);
  const tps = input.timeMs && input.timeMs > 0 ? metrics.etm / (input.timeMs / 1000) : undefined;

  const phases = segmentation.cfopShaped
    ? analyzePhases(segmentation.segments, states, libraryStates, userMoves, toUser)
    : [];

  const modelStm = phases.every((p) => p.model !== null)
    ? phases.reduce((sum, p) => sum + (p.model?.metrics.stm ?? 0), 0)
    : null;

  const findings = buildFindings({
    phases,
    metrics,
    modelStm,
    userMoves,
    cfopShaped: segmentation.cfopShaped,
    timeMs: input.timeMs,
    tps,
  });

  return {
    ok: true,
    scramble: scrambleAlg,
    crossFace,
    moves: userMoves.map((m) => m.token),
    metrics,
    phases,
    findings,
    modelStm,
    cfopShaped: segmentation.cfopShaped,
    cfopReason: segmentation.reason,
    timeMs: input.timeMs,
    tps,
    summary: buildSummary({ phases, metrics, modelStm, findings, cfopShaped: segmentation.cfopShaped, tps }),
  };
}

function analyzePhases(
  segments: readonly Segment[],
  states: readonly CubeJSInstance[],
  libraryStates: readonly CubeJSInstance[],
  userMoves: readonly Move[],
  toUser: TokenMap,
): PhaseAnalysis[] {
  const out: PhaseAnalysis[] = [];
  const solvedPairs: PairId[] = [];

  for (const segment of segments) {
    const slice = userMoves.slice(segment.start, segment.end);
    const moves = slice.map((m) => m.token);
    const base: PhaseAnalysis = {
      phase: segment.phase,
      label: segment.label,
      slot: segment.slot ? relabelSlotName(segment.slot, toUser) : undefined,
      moves,
      metrics: countMoves(slice),
      model: null,
      lost: null,
      skipped: moves.length === 0,
    };

    const start = stateAt(states, segment.start);

    if (segment.phase === "cross") {
      // The cross table is exhaustive, so this reference is provably shortest.
      const model = toModel(solveCrossFromCube(start), toUser, true);
      out.push(withLoss({ ...base, model }));
      continue;
    }

    if (segment.phase === "f2l") {
      const pairIndex = SOLVER_PAIR_NAMES.indexOf(segment.slot as (typeof SOLVER_PAIR_NAMES)[number]);
      const pair = F2L_PAIRS[pairIndex];
      const model = toModel(solvePairFromCube(start, pair, [...solvedPairs]), toUser, true);
      solvedPairs.push(pair);
      out.push(withLoss({ ...base, model }));
      continue;
    }

    if (segment.phase === "oll") {
      const libraryState = stateAt(libraryStates, segment.start);
      const match = recognizeOll(libraryState);
      const skipped = isOllSkip(libraryState);
      let model: ModelSolution | null = null;
      try {
        model = toModel(solveOLL(start), toUser, true);
      } catch {
        // The rare state our from-scratch search can't crack inside its budget.
        model = null;
      }
      out.push(
        withLoss({
          ...base,
          model,
          skipped,
          caseName: skipped ? "OLL skip" : match?.case.name,
          caseAlg: match ? relabelAlg(relabelAlg(match.case.alg, mapToLibraryFrame()), toUser) : undefined,
          caseAlgMoves: match?.algMoves,
        }),
      );
      continue;
    }

    const libraryState = stateAt(libraryStates, segment.start);
    const match = recognizePll(libraryState);
    const skipped = isPllSkip(libraryState);
    let model: ModelSolution | null = null;
    try {
      model = toModel(solvePLL(start), toUser, true);
    } catch {
      model = null;
    }
    out.push(
      withLoss({
        ...base,
        model,
        skipped,
        caseName: skipped ? "PLL skip" : match?.case.name,
        caseAlg: match ? relabelAlg(relabelAlg(match.case.alg, mapToLibraryFrame()), toUser) : undefined,
        caseAlgMoves: match?.algMoves,
      }),
    );
  }

  return out;
}

function withLoss(phase: PhaseAnalysis): PhaseAnalysis {
  if (!phase.model) return phase;
  return { ...phase, lost: Math.max(0, phase.metrics.stm - phase.model.metrics.stm) };
}

interface FindingContext {
  phases: PhaseAnalysis[];
  metrics: MoveMetrics;
  modelStm: number | null;
  userMoves: readonly Move[];
  cfopShaped: boolean;
  timeMs?: number;
  tps?: number;
}

/** How many extra turns in a phase is worth saying something about. */
const NOTABLE_LOSS = 3;
const SERIOUS_LOSS = 6;

function buildFindings(ctx: FindingContext): Finding[] {
  const findings: Finding[] = [];
  const { phases, metrics } = ctx;

  if (!ctx.cfopShaped) {
    findings.push({
      id: "not-cfop",
      severity: "low",
      title: "Analyzed as a whole solve",
      detail:
        "This solve doesn't follow CFOP's cross → F2L → OLL → PLL order, so it's reported as totals " +
        "rather than split into phases. Everything below still describes the moves you actually made.",
    });
  }

  const cross = phases.find((p) => p.phase === "cross");
  if (cross?.model) {
    const lost = cross.lost ?? 0;
    if (lost === 0) {
      findings.push({
        id: "cross-optimal",
        severity: "good",
        phase: "cross",
        title: `Optimal cross in ${cross.metrics.stm}`,
        detail: "You found the shortest cross available from that scramble. That's the hardest part to get right.",
      });
    } else if (lost >= 2) {
      findings.push({
        id: "cross-long",
        severity: lost >= 4 ? "high" : "medium",
        phase: "cross",
        title: `Cross took ${cross.metrics.stm} moves; ${cross.model.metrics.stm} were enough`,
        detail:
          `The shortest cross here was ${cross.model.moves.join(" ")}. ` +
          "Every cross on a 3x3 can be done in 8 moves or fewer, and you get 15 seconds of inspection " +
          "to find it — planning the whole cross before you start is the single cheapest time save there is.",
      });
    }
  }

  const f2l = phases.filter((p) => p.phase === "f2l");
  if (f2l.length) {
    const f2lStm = f2l.reduce((s, p) => s + p.metrics.stm, 0);
    const f2lModel = f2l.every((p) => p.model) ? f2l.reduce((s, p) => s + p.model!.metrics.stm, 0) : null;
    if (f2lModel !== null && f2lStm - f2lModel >= NOTABLE_LOSS) {
      findings.push({
        id: "f2l-total",
        severity: f2lStm - f2lModel >= SERIOUS_LOSS * 2 ? "high" : "medium",
        phase: "f2l",
        title: `F2L cost ${f2lStm - f2lModel} extra moves across the four slots`,
        detail:
          `You used ${f2lStm} moves where ${f2lModel} would have done. Spread over four pairs that's usually ` +
          "not one bad insertion but a habit — rebuilding a pair you could have inserted directly, or " +
          "taking the long route because you didn't spot the piece until you needed it.",
      });
    }

    const worst = [...f2l].sort((a, b) => (b.lost ?? 0) - (a.lost ?? 0))[0];
    if (worst?.model && (worst.lost ?? 0) >= NOTABLE_LOSS) {
      findings.push({
        id: `f2l-worst-${worst.slot}`,
        severity: (worst.lost ?? 0) >= SERIOUS_LOSS ? "high" : "medium",
        phase: "f2l",
        title: `${worst.label} (${worst.slot}) was your most expensive pair: ${worst.lost} extra moves`,
        detail:
          `You played ${worst.moves.join(" ")} (${worst.metrics.stm} moves). From that exact position the pair ` +
          `went in with ${worst.model.moves.join(" ")} (${worst.model.metrics.stm}). ` +
          "Worth setting this case up on a real cube and drilling the shorter insertion until it's automatic.",
      });
    }
  }

  for (const phase of phases) {
    if (phase.phase !== "oll" && phase.phase !== "pll") continue;
    if (phase.skipped) {
      findings.push({
        id: `${phase.phase}-skip`,
        severity: "good",
        phase: phase.phase,
        title: `${phase.phase.toUpperCase()} skip`,
        detail: "Free. Nothing to learn here, but worth enjoying.",
      });
      continue;
    }
    if (!phase.caseName) continue;

    // One turn of slack for the AUF, which the book algorithm doesn't include.
    const reference = (phase.caseAlgMoves ?? 0) + 1;
    if (phase.caseAlgMoves && phase.metrics.stm > reference + 1) {
      findings.push({
        id: `${phase.phase}-long`,
        severity: phase.metrics.stm > reference + 5 ? "high" : "medium",
        phase: phase.phase,
        title: `${phase.caseName} took ${phase.metrics.stm} moves; the standard algorithm is ${phase.caseAlgMoves}`,
        detail:
          `You had ${phase.caseName} and played ${phase.moves.join(" ")}. The one-look algorithm is ` +
          `${phase.caseAlg}. A gap this size usually means the case was solved in two looks, or with an ` +
          "algorithm learned for a different angle — both cost real time even when they work.",
      });
    } else if (phase.caseAlgMoves && phase.metrics.stm <= reference) {
      findings.push({
        id: `${phase.phase}-clean`,
        severity: "good",
        phase: phase.phase,
        title: `${phase.caseName} in ${phase.metrics.stm} moves`,
        detail: "One-look, at the standard move count. Nothing to fix.",
      });
    }
  }

  const cancellations = findCancellations(ctx.userMoves);
  if (cancellations.length) {
    findings.push({
      id: "cancellations",
      severity: "medium",
      title: `${cancellations.length} pair${cancellations.length === 1 ? "" : "s"} of moves that should have merged`,
      detail:
        `Consecutive turns of the same face: ${cancellations.join(", ")}. These cost a full move each and ` +
        "usually mean two algorithms were executed back to back without cancelling them into each other.",
    });
  }

  if (metrics.rotations >= 5) {
    findings.push({
      id: "rotations",
      severity: metrics.rotations >= 8 ? "medium" : "low",
      title: `${metrics.rotations} cube rotations`,
      detail:
        "Rotations don't turn any layer but still cost time, and they break your view of the pieces you were " +
        "tracking. Most F2L pairs can be inserted from the front-right slot with a y rotation at most; " +
        "learning the left-hand insertions removes a lot of these.",
    });
  }

  if (ctx.tps !== undefined && ctx.modelStm !== null && ctx.timeMs) {
    const efficient = metrics.stm <= ctx.modelStm + 8;
    if (ctx.tps < 3 && efficient) {
      findings.push({
        id: "slow-turning",
        severity: "medium",
        title: `Efficient but slow: ${ctx.tps.toFixed(1)} turns per second`,
        detail:
          "Your move count is close to optimal, so the time isn't going into wasted turns — it's going into " +
          "pauses. That's a lookahead problem: practise solving slowly enough that you never stop moving.",
      });
    } else if (ctx.tps >= 5 && !efficient) {
      findings.push({
        id: "fast-inefficient",
        severity: "medium",
        title: `Fast hands, long solve: ${ctx.tps.toFixed(1)} turns per second`,
        detail:
          `You're turning quickly but played ${metrics.stm} moves where about ${ctx.modelStm} were needed. ` +
          "Turning faster has a ceiling; cutting moves doesn't. Slow down and take the shorter route.",
      });
    }
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, good: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Consecutive turns of the same face, which are always one move in disguise
 * (R R' is nothing, R R is R2). Only directly adjacent pairs count — with a
 * move in between, whether they merge depends on the cube, not the notation.
 */
function findCancellations(moves: readonly Move[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < moves.length; i++) {
    const prev = moves[i - 1];
    const cur = moves[i];
    if (prev.kind === "rotation" || cur.kind === "rotation") continue;
    if (prev.base === cur.base) out.push(`${prev.token} ${cur.token}`);
  }
  return out;
}

function buildSummary(ctx: {
  phases: PhaseAnalysis[];
  metrics: MoveMetrics;
  modelStm: number | null;
  findings: Finding[];
  cfopShaped: boolean;
  tps?: number;
}): string {
  const parts: string[] = [];
  parts.push(`${ctx.metrics.stm} moves (${ctx.metrics.etm} counting rotations)`);
  if (ctx.modelStm !== null) {
    const extra = ctx.metrics.stm - ctx.modelStm;
    parts.push(
      extra <= 0
        ? "which is as short as this solve could reasonably have been"
        : `against about ${ctx.modelStm} available — ${extra} spare`,
    );
  }
  if (ctx.tps !== undefined) parts.push(`at ${ctx.tps.toFixed(1)} turns per second`);

  const biggest = ctx.phases
    .filter((p) => p.lost !== null)
    .sort((a, b) => (b.lost ?? 0) - (a.lost ?? 0))[0];
  const tail =
    biggest && (biggest.lost ?? 0) >= NOTABLE_LOSS
      ? ` The most expensive phase was ${biggest.label}${biggest.slot ? ` (${biggest.slot})` : ""}, at ${biggest.lost} extra moves.`
      : ctx.cfopShaped
        ? " No single phase stands out as the problem."
        : "";

  return `${parts.join(", ")}.${tail}`;
}

/** Convenience for callers that only have a scramble and want the reference solve. */
export function referenceCube(scramble: string): CubeJSInstance {
  const cube = new Cube();
  cube.move(scramble);
  return cube;
}
