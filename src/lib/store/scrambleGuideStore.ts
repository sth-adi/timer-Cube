import { create } from "zustand";
import type { GuideView } from "@/lib/smartcube/scrambleGuide";

export interface ScrambleGuideState {
  /** The scramble being guided, or null when no smart-cube scramble is in progress. */
  scramble: string | null;
  /** "planning": working out the route (the cube wasn't solved, or a turn went unreported). */
  status: "idle" | "planning" | "guiding";
  /**
   * The steps are a route from wherever the cube was, not the scramble's own
   * moves — because the cube didn't start solved, or it wandered too far to
   * be worth undoing.
   */
  rerouted: boolean;
  view: GuideView | null;
}

/** Live progress through the smart-cube scramble — written by useScrambleGuide, read by the scramble displays. */
export const useScrambleGuideStore = create<ScrambleGuideState>(() => ({ scramble: null, status: "idle", rerouted: false, view: null }));
