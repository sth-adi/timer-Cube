import { INSPECTION_MS } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";

/**
 * How the inspection countdown is coloured, so the digits and the ring around the screen agree.
 * The thresholds are the ring's (see InspectionRing.tsx): amber from 8s into inspection, red from 12s.
 * Keep the two in step if either ever moves.
 */
export const INSPECTION_WARN_AT_MS = 8_000;
export const INSPECTION_DANGER_AT_MS = 12_000;
/** How long the digits pulse after crossing 8s and 12s. */
export const INSPECTION_PULSE_MS = 600;

/** calm: plenty of time; warn: 8s gone; danger: 12s gone; penalty: the +2 (or DNF) now applies. */
export type InspectionTone = "calm" | "warn" | "danger" | "penalty";

/** Seconds into inspection, from what the flow reports as remaining. */
export function inspectionElapsedMs(remainingMs: number): number {
  return Math.max(0, Math.min(INSPECTION_MS, INSPECTION_MS - remainingMs));
}

export function inspectionTone(remainingMs: number, penalty: Penalty): InspectionTone {
  if (penalty !== "none") return "penalty";
  const elapsed = inspectionElapsedMs(remainingMs);
  if (elapsed >= INSPECTION_DANGER_AT_MS) return "danger";
  if (elapsed >= INSPECTION_WARN_AT_MS) return "warn";
  return "calm";
}

/** True for a moment right after the 8s and 12s marks — the digits swell and settle. */
export function inspectionPulsing(remainingMs: number, penalty: Penalty): boolean {
  if (penalty !== "none") return false;
  const elapsed = inspectionElapsedMs(remainingMs);
  return [INSPECTION_WARN_AT_MS, INSPECTION_DANGER_AT_MS].some((mark) => elapsed >= mark && elapsed < mark + INSPECTION_PULSE_MS);
}

/** What a screen reader hears when the tone changes (it only changes at the marks, so it isn't re-announced per frame). */
export function inspectionAnnouncement(tone: InspectionTone, penalty: Penalty): string {
  if (tone === "penalty") return penalty === "dnf" ? "Inspection over 17 seconds: DNF" : "Inspection over 15 seconds: plus 2 penalty applies";
  if (tone === "danger") return "12 seconds of inspection used";
  if (tone === "warn") return "8 seconds of inspection used";
  return "";
}
