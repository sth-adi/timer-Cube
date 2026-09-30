import { create } from "zustand";
import type { SolveGyroSummary } from "@/lib/gyro/solveGyro";
import type { GazeReport } from "@/lib/gaze/gaze";

export interface SolveRecap {
  /** The finished solve this is for (smartCubeStore.solvedAtMs). */
  solvedAtMs: number;
  scramble: string;
  gyro: SolveGyroSummary | null;
  gaze: { report: GazeReport; facelets: string } | null;
  /**
   * A solve that lost a turn over Bluetooth: what was put back ("repaired"),
   * or that nothing could be ("time-only" — the time stands, the recap
   * doesn't). Absent when no turn was lost.
   */
  turnLoss?: { kind: "repaired"; change: { kind: "inserted" | "removed"; index: number; tokens: string[] } } | { kind: "time-only" };
}

/**
 * The last smart-cube solve that's been saved, and what the recap shows
 * about it. Lives outside the timer component on purpose: the finished
 * solve stays in smartCubeStore while you visit other tabs, and when the
 * timer remounts this is how it knows that solve is already saved — rather
 * than saving it again (which used to undo deleting it).
 */
export const useRecapStore = create<{ recap: SolveRecap | null }>(() => ({ recap: null }));
