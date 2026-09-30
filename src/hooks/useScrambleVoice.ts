"use client";

import { useEffect } from "react";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { scrambleCallout } from "@/lib/smartcube/spokenScramble";
import { say, silence } from "@/lib/smartcube/voiceCoach";
import type { GuideView } from "@/lib/smartcube/scrambleGuide";

/**
 * Reads the smart-cube scramble aloud as you make it (see
 * lib/smartcube/spokenScramble.ts): the next turn, what to undo after a
 * wrong one, "scrambled" at the end. Follows the on-screen guide's own
 * progress, so it needs no state of its own beyond the last view it spoke from.
 */
export function useScrambleVoice(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let prev: { scramble: string | null; view: GuideView | null } = { scramble: null, view: null };
    const speak = (state: ReturnType<typeof useScrambleGuideStore.getState>) => {
      const view = state.view;
      if (!view) {
        prev = { scramble: state.scramble, view: null };
        return;
      }
      // A different scramble starts from the top, whatever the old one had reached.
      const before = prev.scramble === state.scramble ? prev.view : null;
      const line = scrambleCallout(before, view);
      prev = { scramble: state.scramble, view };
      if (line) say(line, { interrupt: true, rate: 1.05 });
    };
    speak(useScrambleGuideStore.getState());
    const unsubscribe = useScrambleGuideStore.subscribe(speak);
    return () => {
      unsubscribe();
      silence();
    };
  }, [enabled]);
}
