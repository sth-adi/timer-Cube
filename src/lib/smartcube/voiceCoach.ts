import { paceFor, type PhaseBaseline } from "@/lib/analysis/postSolveBaseline";
import type { Penalty } from "@/types";

/**
 * What the Voice Coach says during a smart-cube solve — pure text, so the
 * wording is testable without a speech engine.
 *
 * "splits" calls each phase's time as it lands and the final time; "full"
 * adds the WCA inspection calls, how each phase ran against your own usual
 * pace, and a personal-best / gap-to-best call on the finish.
 */

export const VOICE_MODES = [
  { id: "off", name: "Off" },
  { id: "splits", name: "Splits" },
  { id: "full", name: "Full" },
] as const;
export type VoiceMode = (typeof VOICE_MODES)[number]["id"];

/** Spelled out where a speech engine would otherwise mash it into a word ("oll"). */
const PHASE_SPOKEN = ["Cross", "F 2 L", "O L L", "P L L"] as const;

/** "12.34", or "1 minute 2.34" past a minute — centiseconds floored, like the on-screen clock. */
export function spokenTime(ms: number): string {
  const cs = Math.max(0, Math.floor(ms / 10));
  const minutes = Math.floor(cs / 6000);
  const rest = cs % 6000;
  const secs = `${Math.floor(rest / 100)}.${String(rest % 100).padStart(2, "0")}`;
  if (minutes === 0) return secs;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${secs}`;
}

/** A gap between two times, spoken: "0.40". */
function spokenGap(ms: number): string {
  return spokenTime(Math.abs(ms));
}

/** One phase finishing: "Cross 1.85", and in full mode how it ran against your usual — "Cross 1.85, fast". */
export function splitCallout(opts: {
  /** 0 = cross, 1 = F2L, 2 = OLL, 3 = PLL. */
  phase: 0 | 1 | 2 | 3;
  durationMs: number;
  mode: VoiceMode;
  baseline?: PhaseBaseline | null;
}): string {
  const base = `${PHASE_SPOKEN[opts.phase]} ${spokenTime(opts.durationMs)}`;
  if (opts.mode !== "full") return base;
  const pace = paceFor(opts.durationMs, opts.baseline ?? null);
  return pace && pace !== "normal" ? `${base}, ${pace}` : base;
}

/**
 * The finish: the PLL split (so the last phase isn't skipped), then the
 * time — "P L L 1.20. 12.34" — plus, in full mode, "new personal best" or
 * how far off it was. `priorBestMs` is your best *before* this solve (null
 * with no history, in which case nothing is claimed either way).
 */
export function finishCallout(opts: {
  timeMs: number;
  penalty: Penalty;
  mode: VoiceMode;
  pllMs?: number | null;
  baseline?: PhaseBaseline | null;
  priorBestMs?: number | null;
}): string {
  const parts: string[] = [];
  if (opts.pllMs != null && opts.pllMs > 0) {
    parts.push(splitCallout({ phase: 3, durationMs: opts.pllMs, mode: opts.mode, baseline: opts.baseline }));
  }
  if (opts.penalty === "dnf") {
    parts.push("D N F");
    return parts.join(". ");
  }
  parts.push(opts.penalty === "plus2" ? `${spokenTime(opts.timeMs)} plus 2` : spokenTime(opts.timeMs));
  if (opts.mode === "full" && opts.priorBestMs != null && opts.priorBestMs > 0) {
    const counted = opts.penalty === "plus2" ? opts.timeMs + 2000 : opts.timeMs;
    if (counted < opts.priorBestMs) parts.push("New personal best!");
    else if (counted > opts.priorBestMs) parts.push(`${spokenGap(counted - opts.priorBestMs)} off your best`);
  }
  return parts.join(". ");
}

/** WCA inspection calls, spoken at 8 and 12 seconds of the 15. */
export const INSPECTION_CALLS = [
  { atRemainingMs: 7000, text: "8 seconds" },
  { atRemainingMs: 3000, text: "12 seconds" },
] as const;

// --- speech plumbing ------------------------------------------------------

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function voiceSupported(): boolean {
  return synth() !== null;
}

/** Says `text`. `interrupt` drops anything still queued first — used for the finish, which shouldn't wait behind a stale split. */
export function say(text: string, { interrupt = false, rate = 1.1 }: { interrupt?: boolean; rate?: number } = {}): void {
  const s = synth();
  if (!s || !text) return;
  if (interrupt) s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  s.speak(u);
}

export function silence(): void {
  synth()?.cancel();
}
