import { getCubeEngineClient } from "../cube-engine/client";
import type { SolveAnalysis } from "./analyze";
import type { SmartCubeMove } from "../store/smartCubeStore";

export interface SmartCubeAnalytics {
  analysis: SolveAnalysis;
  /**
   * Cumulative elapsed ms at the Cross/F2L/OLL boundaries (PLL's boundary is
   * the solve's own total time) — three entries, matching `Solve.splits`'
   * "N-1 boundaries for N phases" convention so this slots straight into the
   * existing 4-phase stats (PHASE_LABELS[4] = Cross/F2L/OLL/PLL). Undefined
   * when the solve wasn't CFOP-shaped enough to split cleanly.
   */
  splits?: number[];
  ollCaseName?: string;
  pllCaseName?: string;
}

/**
 * Runs a finished smart-cube solve's captured reconstruction through the
 * same analyzer pipeline the manual/keyboard analyzer uses — that pipeline
 * already handles the tricky part (reconciling this app's cross-on-U solver
 * frame against the algorithm library's last-layer-on-U frame) in a tested
 * way, so this reuses it rather than re-deriving OLL/PLL recognition from
 * scratch for live data.
 *
 * The analyzer only ever sees move *text*, so it has no notion of when each
 * move happened — it hands back phases as move-count slices. This maps those
 * counts back onto the smart cube's own per-move timestamps to get wall-clock
 * splits, which is the one thing the analyzer can't already do for us.
 */
export async function analyzeSmartCubeSolve(
  scramble: string,
  moves: readonly SmartCubeMove[],
  startedAtMs: number,
): Promise<SmartCubeAnalytics | null> {
  const reconstruction = moves.map((m) => m.token).join(" ");
  if (!scramble.trim() || !reconstruction.trim()) return null;

  const client = getCubeEngineClient();
  await client.ready();
  const result = await client.analyzeSolve({ scramble, reconstruction });
  if (!result.ok) return null;

  const ollPhase = result.phases.find((p) => p.phase === "oll");
  const pllPhase = result.phases.find((p) => p.phase === "pll");

  const timestampAt = (moveCount: number): number | undefined =>
    moveCount > 0 && moveCount <= moves.length ? moves[moveCount - 1].timeStampMs - startedAtMs : undefined;

  let splits: number[] | undefined;
  const totalPhaseMoves = result.phases.reduce((n, p) => n + p.moves.length, 0);
  if (result.cfopShaped && totalPhaseMoves === moves.length) {
    let cursor = 0;
    let crossEnd: number | undefined;
    let f2lEnd: number | undefined;
    let ollEnd: number | undefined;
    for (const phase of result.phases) {
      cursor += phase.moves.length;
      if (phase.phase === "cross") crossEnd = cursor;
      if (phase.phase === "f2l") f2lEnd = cursor; // overwritten by each slot; ends on the last one
      if (phase.phase === "oll") ollEnd = cursor;
    }
    const crossMs = crossEnd !== undefined ? timestampAt(crossEnd) : undefined;
    const f2lMs = f2lEnd !== undefined ? timestampAt(f2lEnd) : undefined;
    const ollMs = ollEnd !== undefined ? timestampAt(ollEnd) : undefined;
    if (
      crossMs !== undefined &&
      f2lMs !== undefined &&
      ollMs !== undefined &&
      crossMs <= f2lMs &&
      f2lMs <= ollMs
    ) {
      splits = [crossMs, f2lMs, ollMs];
    }
  }

  return { analysis: result, splits, ollCaseName: ollPhase?.caseName, pllCaseName: pllPhase?.caseName };
}
