import { analyzeF2lFlow, type F2lFlowReport } from "./f2lFlow";
import { runLastSlotOracle, type OracleOptions, type OracleReport } from "./lastSlotOracle";
import { extractAlgExecutions, type AlgExecution } from "./algMicroscope";
import { analyzeNeutralitySolve, type NeutralitySolve } from "./neutrality";
import type { XraySolveInput } from "./common";

/** Everything the X-Ray knows about one solve. */
export interface SolveXray {
  flow: F2lFlowReport | null;
  oracle: OracleReport | null;
  executions: AlgExecution[];
  neutrality: NeutralitySolve | null;
}

export interface XrayRequest extends XraySolveInput {
  date?: number;
  /** Skip the (comparatively expensive) last-slot search — for bulk history scans that only need the cheap parts. */
  skipOracle?: boolean;
  oracle?: OracleOptions;
}

/** Runs all four analyses on one solve; each fails soft (null / empty) on a solve it can't make sense of. */
export function xraySolve(req: XrayRequest): SolveXray {
  const input = { scramble: req.scramble, moves: req.moves, timesMs: req.timesMs };
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    flow: safe(() => analyzeF2lFlow(input), null),
    oracle: req.skipOracle ? null : safe(() => runLastSlotOracle(input, req.oracle), null),
    executions: safe(() => extractAlgExecutions({ ...input, date: req.date }), []),
    neutrality: safe(() => analyzeNeutralitySolve({ ...input, date: req.date }), null),
  };
}
