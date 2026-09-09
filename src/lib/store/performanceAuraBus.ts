/**
 * A tiny imperative pub-sub channel — deliberately not a Zustand store — for
 * the live "performance aura": the ambient background reacting in real time
 * to whether the current solve is running ahead of or behind its predicted
 * pace (see lib/analysis/prediction.ts and GhostPaceBar's own PB target).
 *
 * TimerView already re-renders every animation frame while the clock is
 * running (that's how the digits themselves animate), so a plain listener
 * set — no React state, no store subscription reconciliation — is enough,
 * and it means AuroraBackground can push style updates straight onto the DOM
 * without React re-rendering the whole background layer 60 times a second
 * for a value nothing else in the component tree needs.
 */

export type PaceStatus = "ahead" | "behind" | "neutral";

export interface PerformanceAura {
  /** null when there's no solve running (or no target to compare against) — the ambient default. */
  status: PaceStatus | null;
  /** 0-1, how far off pace, for scaling the visual intensity. */
  intensity: number;
}

type Listener = (aura: PerformanceAura) => void;

const listeners = new Set<Listener>();
let current: PerformanceAura = { status: null, intensity: 0 };

export function setPerformanceAura(aura: PerformanceAura): void {
  current = aura;
  for (const listener of listeners) listener(current);
}

export function resetPerformanceAura(): void {
  setPerformanceAura({ status: null, intensity: 0 });
}

/** Subscribes and immediately delivers the current value, so a late-mounting listener isn't stuck at a stale default. */
export function subscribePerformanceAura(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** Derives a status+intensity from how elapsed time compares to a pace target — shared by whatever feeds this bus. */
export function paceFromRatio(elapsedMs: number, targetMs: number): PerformanceAura {
  if (targetMs <= 0) return { status: "neutral", intensity: 0 };
  const ratio = elapsedMs / targetMs;
  const deviation = ratio - 1;
  const intensity = Math.min(1, Math.abs(deviation) / 0.5);
  const status: PaceStatus = deviation < -0.05 ? "ahead" : deviation > 0.05 ? "behind" : "neutral";
  return { status, intensity };
}
