import { create } from "zustand";
import type { SolveGyroSummary } from "@/lib/gyro/solveGyro";
import type { GazeReport } from "@/lib/gaze/gaze";

export interface SolveRecap {
  /** The finished solve this is for (smartCubeStore.solvedAtMs). */
  solvedAtMs: number;
  scramble: string;
  gyro: SolveGyroSummary | null;
  gaze: { report: GazeReport; facelets: string } | null;
}

/**
 * The last smart-cube solve that's been saved, and what the recap shows
 * about it. Lives outside the timer component on purpose: the finished
 * solve stays in smartCubeStore while you visit other tabs, and when the
 * timer remounts this is how it knows that solve is already saved — rather
 * than saving it again (which used to undo deleting it).
 */
export const useRecapStore = create<{ recap: SolveRecap | null }>(() => ({ recap: null }));
