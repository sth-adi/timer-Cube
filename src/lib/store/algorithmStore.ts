import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import type { AlgCase } from "@/lib/algorithms/types";
import {
  applyRecallTime,
  applyReview,
  deriveStatus,
  initialProgress,
  isDue,
  type CaseProgress,
  type CaseStatus,
  type ReviewRating,
} from "@/lib/algorithms/srs";

export const ALL_CASES: AlgCase[] = [...PLL_CASES, ...OLL_CASES];
const CASE_BY_ID = new Map(ALL_CASES.map((c) => [c.id, c]));

interface AlgorithmState {
  progress: Record<string, CaseProgress>;
  review: (caseId: string, rating: ReviewRating) => void;
  /** Records a recall-time sample (case shown -> algorithm revealed). Returns true if it beat the case's previous best. */
  recordRecallTime: (caseId: string, ms: number) => boolean;
  bestRecallMs: (caseId: string) => number | null;
  statusOf: (caseId: string) => CaseStatus;
  dueCaseIds: (group?: "PLL" | "OLL") => string[];
  resetProgress: (caseId: string) => void;
}

export const useAlgorithmStore = create<AlgorithmState>()(
  persist(
    (set, get) => ({
      progress: {},

      review: (caseId, rating) => {
        const existing = get().progress[caseId] ?? initialProgress(caseId);
        const updated = applyReview(existing, rating);
        set((s) => ({ progress: { ...s.progress, [caseId]: updated } }));
      },

      statusOf: (caseId) => deriveStatus(get().progress[caseId]),

      dueCaseIds: (group) => {
        const { progress } = get();
        const now = Date.now();
        return ALL_CASES.filter((c) => (!group || c.group === group) && isDue(progress[c.id], now)).map(
          (c) => c.id,
        );
      },

      resetProgress: (caseId) => {
        set((s) => {
          const next = { ...s.progress };
          delete next[caseId];
          return { progress: next };
        });
      },

      recordRecallTime: (caseId, ms) => {
        const existing = get().progress[caseId] ?? initialProgress(caseId);
        const { progress, isPB } = applyRecallTime(existing, ms);
        if (isPB) set((s) => ({ progress: { ...s.progress, [caseId]: progress } }));
        return isPB;
      },

      bestRecallMs: (caseId) => get().progress[caseId]?.bestRecallMs ?? null,
    }),
    { name: "cube-timer-algorithms" },
  ),
);

export function getCase(id: string): AlgCase | undefined {
  return CASE_BY_ID.get(id);
}
