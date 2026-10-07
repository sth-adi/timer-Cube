/**
 * Pure choices for the solved moment: which phase colour the finish ring takes, and which splits
 * carry the gold marker. The ring and the marker themselves are CSS (styles/moments.css, live-solve.css).
 */

/** The ribbon's own tint for each phase (Cross, F2L, OLL, PLL), as the theme tokens the ribbon paints with. */
export const PHASE_HUE_VARS = ["--accent", "--cyan", "--warning", "--success"] as const;

/** Index of the last phase that has a time (the one the solve ended in), or -1 when none has. */
export function lastPhaseIndex(durations: readonly (number | null | undefined)[]): number {
  for (let i = durations.length - 1; i >= 0; i--) if (durations[i] !== null && durations[i] !== undefined) return i;
  return -1;
}

/** The theme token of the phase the solve ended in; the accent when no phase landed (a stopped or DNF solve). */
export function finishHueVar(durations: readonly (number | null | undefined)[]): string {
  const i = lastPhaseIndex(durations);
  return i >= 0 && i < PHASE_HUE_VARS.length ? PHASE_HUE_VARS[i] : PHASE_HUE_VARS[0];
}

/** How long the cube stays on screen after the last turn so its settle can be seen, ms. */
export const CUBE_SETTLE_MS = 520;
/** How long the ring on the digits runs, ms (also its duration in styles/moments.css). */
export const FINISH_RING_MS = 600;
