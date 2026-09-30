/**
 * Imperative channel into the global FX layer (components/chrome/FxLayer.tsx)
 * — same deliberately-not-Zustand pattern as performanceAuraBus.ts: effects
 * fire from anywhere (a solve finishing, a PB toast) and are drawn straight
 * onto a canvas, so none of it round-trips through React state.
 */

export type FxPhase = "idle" | "inspecting" | "holding" | "ready" | "running" | "stopped";

export type FxImpactKind = "solve" | "pb" | "dnf";

type FxEvent =
  | { type: "burst"; x: number; y: number; count?: number; power?: number }
  | { type: "impact"; kind: FxImpactKind }
  | { type: "phase"; phase: FxPhase }
  | { type: "party" };

type Listener = (e: FxEvent) => void;

const listeners = new Set<Listener>();
let currentPhase: FxPhase = "idle";

function emit(e: FxEvent): void {
  for (const l of listeners) l(e);
}

export function subscribeFx(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A spark fountain at a viewport position. */
export function fxBurst(x: number, y: number, opts: { count?: number; power?: number } = {}): void {
  emit({ type: "burst", x, y, ...opts });
}

/** Full-screen moment: shockwave rings from the timer, shard shower, and a shake — scaled by `kind`. */
export function fxImpact(kind: FxImpactKind): void {
  emit({ type: "impact", kind });
}

/** Tells the global layer what the timer is doing so the whole UI can lean into it (focus mode, reactor, glow). */
export function setFxPhase(phase: FxPhase): void {
  if (phase === currentPhase) return;
  currentPhase = phase;
  emit({ type: "phase", phase });
}

export function getFxPhase(): FxPhase {
  return currentPhase;
}

export function fxParty(): void {
  emit({ type: "party" });
}
