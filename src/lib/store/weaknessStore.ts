import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { aggregateWeakness, type WeaknessReport } from "@/lib/analysis/weaknessReport";
import type { SolveAnalysis } from "@/lib/analysis/analyze";
import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";

/**
 * How many of the most recent analyzed solves to actually re-run. Each one
 * costs a handful of IDA* searches (a couple of seconds), and this is
 * triggered by an explicit button press, not silently on every Stats view —
 * still, an unbounded "every solve you've ever saved" would make that button
 * a multi-minute wait, so it's capped to a sample that's recent enough to be
 * about your current habits.
 */
const SAMPLE_SIZE = 10;

interface WeaknessState {
  report: WeaknessReport | null;
  /** The exact solve ids + reconstructions the current report was built from — a report is stale the moment this changes. */
  signature: string | null;
  loading: boolean;
  progress: { done: number; total: number };
  error: string | null;
  build: (solves: Solve[]) => Promise<void>;
}

function buildSignature(solves: Solve[]): string {
  return solves.map((s) => `${s.id}:${s.reconstruction}`).join("|");
}

export function candidateSolves(solves: Solve[]): (Solve & { reconstruction: string })[] {
  return solves
    .filter((s): s is Solve & { reconstruction: string } => !!s.reconstruction)
    .sort((a, b) => b.date - a.date)
    .slice(0, SAMPLE_SIZE);
}

export const useWeaknessStore = create<WeaknessState>((set) => ({
  report: null,
  signature: null,
  loading: false,
  progress: { done: 0, total: 0 },
  error: null,

  build: async (allSolves) => {
    const candidates = candidateSolves(allSolves);
    const signature = buildSignature(candidates);
    if (candidates.length === 0) {
      set({ report: aggregateWeakness([]), signature, error: null });
      return;
    }

    set({ loading: true, error: null, progress: { done: 0, total: candidates.length } });
    try {
      const client = getCubeEngineClient();
      await client.ready();

      const analyses: SolveAnalysis[] = [];
      for (const solve of candidates) {
        const result = await client.analyzeSolve({
          scramble: solve.scramble,
          reconstruction: solve.reconstruction,
          timeMs: solveFinalMs(solve) ?? undefined,
        });
        // A saved reconstruction can go stale (the solve's scramble field
        // was edited, say) — skip anything that no longer analyzes rather
        // than failing the whole report over one bad entry.
        if (result.ok) analyses.push(result);
        set((s) => ({ progress: { done: s.progress.done + 1, total: candidates.length } }));
      }

      set({ report: aggregateWeakness(analyses), signature, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
