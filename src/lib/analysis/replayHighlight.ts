import type { PhaseMark } from "./replayTiming";
import { FACES_IN_ORDER } from "@/lib/cube-engine/stickerTurns";

/**
 * Pieces light up as the replay solves them: when a phase lands (cross, F2L, OLL, PLL) the stickers it put
 * home glow for a moment and fade. Which stickers is read off the facelets (a sticker is home when it shows
 * the colour of the face it sits on, as in smartcube/cubeProgress), and the glow is a pure function of the
 * position, so scrubbing and playing agree.
 */

export const HIGHLIGHT_MS = 600;

export interface HighlightEvent {
  atMs: number;
  stickers: number[];
}

const homeAt = (facelets: string, i: number) => facelets[i] === FACES_IN_ORDER[Math.floor(i / 9)];

/** Stickers home in `after` that were not home in `before` (centres never are, so they are left out). */
export function newlyHome(before: string, after: string): number[] {
  const out: number[] = [];
  if (before.length !== 54 || after.length !== 54) return out;
  for (let i = 0; i < 54; i++) if (i % 9 !== 4 && homeAt(after, i) && !homeAt(before, i)) out.push(i);
  return out;
}

/** One event per phase mark: when its last move ends, and the stickers that phase put right. */
export function planHighlights(args: {
  marks?: readonly PhaseMark[];
  ends: readonly number[];
  faceletsAfter: readonly string[];
}): HighlightEvent[] {
  const { marks, ends, faceletsAfter } = args;
  if (!marks) return [];
  const out: HighlightEvent[] = [];
  let prev = 0;
  for (const m of marks) {
    const end = Math.min(m.moveIndex, ends.length);
    const before = faceletsAfter[prev];
    const after = faceletsAfter[end];
    if (end > prev && before && after) {
      const stickers = newlyHome(before, after);
      if (stickers.length) out.push({ atMs: ends[end - 1], stickers });
    }
    prev = Math.max(prev, m.moveIndex);
  }
  return out;
}

/** The glow at `pos`: strength eases from 1 to 0 over HIGHLIGHT_MS after an event; null when there is none. */
export function highlightAt(events: readonly HighlightEvent[], pos: number): { stickers: readonly number[]; strength: number } | null {
  for (const e of events) {
    const t = (pos - e.atMs) / HIGHLIGHT_MS;
    if (t >= 0 && t < 1) {
      const s = 1 - t * t * (3 - 2 * t);
      return s > 0.004 ? { stickers: e.stickers, strength: s } : null;
    }
  }
  return null;
}
