import { create } from "zustand";
import type { PlanTarget } from "@/lib/analysis/dailyPlan";

/** A resolved, one-shot instruction for TrainerHub — see page.tsx's subscription for why this is handed down as a prop rather than read directly from the store. */
export interface PendingTrainerNav {
  target: Exclude<PlanTarget, "timer">;
  seq: number;
}

interface NavigationState {
  target: PlanTarget | null;
  /**
   * Bumped whenever something outside the shell (the daily practice plan
   * card) asks to jump to a tab, so the shell can switch without the two
   * components having to know about each other — same pattern as
   * analysisStore's requestSeq for "Analyze this solve".
   */
  requestSeq: number;
  requestNavigate: (target: PlanTarget) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  target: null,
  requestSeq: 0,
  requestNavigate: (target) => set((s) => ({ target, requestSeq: s.requestSeq + 1 })),
}));
