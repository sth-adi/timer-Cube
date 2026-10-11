/**
 * The replay player's playback maths, kept pure so it can be tested without a
 * 3D player: how per-move capture gaps become a timeline, how a scrubber
 * position carries across timing modes, which move is "current" at a given
 * moment, and where the CFOP phase boundaries fall on the slider.
 */

/** Visual duration for one turn's animation (shorter only when the real gap was) — the pause *before* a move varies with the real gap. */
export const TURN_MS = 150;
/** Under prefers-reduced-motion a turn snaps (a sliver of time, so the timeline stays valid) instead of animating. */
export const SNAP_TURN_MS = 16;
/** The longest idle pause (the thinking time before a move) kept in the default, compressed replay. */
export const IDLE_CAP_MS = 600;

export interface ReplayTimeline {
  /** When each move's turn begins, ms from the start of playback — one per move. */
  starts: number[];
  /** When each move's turn finishes. */
  ends: number[];
  durationMs: number;
  /**
   * Index = move index. Non-null only for a double turn played as its two real quarter turns (see doubleSplit): the
   * first quarter runs firstStart..firstEnd (ending at its recorded time), the second secondStart..secondEnd.
   * `starts[i]` is then firstStart and `ends[i]` secondEnd. Absent when no double was split.
   */
  halves?: ({ firstStart: number; firstEnd: number; secondStart: number; secondEnd: number } | null)[];
}

/** No turn is drawn shorter than this, so the player never gets a zero-length animation. */
export const MIN_TURN_MS = 12;
/**
 * Fluid replay (the 3D cube): a turn is as long as a real quarter turn feels (FLUID_TURN_MS, scaled up for a half turn),
 * or, when the cuber was quicker than that, almost the whole gap (FLUID_TURN_FRAC), so fast stretches flow instead of
 * snapping. A long pause never stretches a turn into slow motion.
 */
export const FLUID_TURN_FRAC = 0.94;
export const FLUID_TURN_MS = 190;
/** A half turn (U2) travels twice the angle: it gets 1.75x the time, not 2x, as a real double turn is a little quicker per degree. */
export const HALF_TURN_SCALE = 1.75;

/** How long each move's turn naturally takes, relative to a quarter turn: 1 for U/R'/M, 1.75 for U2, a little more for a rotation. */
export function turnScales(tokens: readonly string[]): number[] {
  return tokens.map((t) => (t.endsWith("2") ? HALF_TURN_SCALE : /^[xyz]/.test(t) ? 1.15 : 1));
}

/**
 * Lays moves out on a timeline from the real gap before each one (ms since the
 * previous move; the first from the solve's start). A move's turn takes
 * `turnMs`, or the whole gap when the cuber was quicker than that (at 8+ turns
 * a second the gap is shorter than a turn, and giving every turn its full
 * length would make the replay run longer than the solve was). Whatever is
 * left of a gap is idle time, which by default is capped at IDLE_CAP_MS so a
 * three-second recognition pause isn't three seconds of nothing. `realPauses`
 * keeps the true gaps, so each turn then ends at its recorded timestamp and
 * the replay lasts exactly as long as the solve.
 *
 * `fluid` is for the smooth 3D replay (see FLUID_TURN_MS): turns last their natural time, or most of a short gap, and `scales`
 * (one per move, see turnScales) makes a half turn longer than a quarter turn. Every turn still ends at its recorded timestamp.
 *
 * `halves` (fluid only): per move, when its first quarter turn was made, on the same clock as the gaps added up
 * (see lib/analysis/doubleSplit). Such a move is laid out as two quarter turns, each by the rules above against its own
 * gap (the first from the previous move's end to t1, the second from t1 to the move's time), and reported in `halves`.
 *
 * A gap too short to hold even MIN_TURN_MS (two halves of a slice turn
 * arriving together) borrows the difference from the next idle time, so the
 * replay doesn't drift away from the clock the solve ran on.
 */
export function buildTimeline(gapsMs: readonly number[], opts: { realPauses?: boolean; turnMs?: number; idleCapMs?: number; fluid?: boolean; scales?: readonly number[]; halves?: readonly (number | null | undefined)[] } = {}): ReplayTimeline {
  const turnMax = opts.turnMs ?? TURN_MS;
  const turnMin = Math.min(MIN_TURN_MS, turnMax);
  const cap = opts.idleCapMs ?? IDLE_CAP_MS;
  const starts: number[] = [];
  const ends: number[] = [];
  const halves: NonNullable<ReplayTimeline["halves"]> = [];
  let anyHalf = false;
  let end = 0;
  let debt = 0;
  let clock = 0;
  /** One turn after `gap` ms of real time, lasting up to `natural`: where it starts and ends. */
  const place = (gap: number, natural: number): [number, number] => {
    const turn = opts.fluid ? Math.max(turnMin, Math.min(natural, gap * FLUID_TURN_FRAC)) : Math.max(turnMin, Math.min(turnMax, gap));
    let idle = Math.max(0, gap - turn);
    const repaid = Math.min(debt, idle);
    idle -= repaid;
    debt += Math.max(0, turn - gap) - repaid;
    const start = end + (opts.realPauses ? idle : Math.min(idle, cap));
    end = start + turn;
    return [start, end];
  };
  for (let m = 0; m < gapsMs.length; m++) {
    const gap = Math.max(0, gapsMs[m]);
    const t2 = clock + gap;
    const t1 = opts.fluid ? opts.halves?.[m] : null;
    if (typeof t1 === "number" && t1 > clock && t1 < t2) {
      const [firstStart, firstEnd] = place(t1 - clock, FLUID_TURN_MS);
      const [secondStart, secondEnd] = place(t2 - t1, FLUID_TURN_MS);
      starts.push(firstStart);
      ends.push(secondEnd);
      halves.push({ firstStart, firstEnd, secondStart, secondEnd });
      anyHalf = true;
    } else {
      const [start, stop] = place(gap, FLUID_TURN_MS * (opts.scales?.[m] ?? 1));
      starts.push(start);
      ends.push(stop);
      halves.push(null);
    }
    clock = t2;
  }
  return { starts, ends, durationMs: end, ...(anyHalf ? { halves } : {}) };
}

/** The edges of every turn in order: 0, start0, end0, start1, end1, … — what a position is measured against. */
function knots(t: ReplayTimeline): number[] {
  const out = [0];
  for (let i = 0; i < t.starts.length; i++) out.push(t.starts[i], t.ends[i]);
  return out;
}

/**
 * Carries a scrubber position from one timeline to another over the same
 * moves (the timing mode changed): the same point in the same turn or the same
 * fraction of the same pause, so the cube shows the same moment before and
 * after. Both timelines must be built from the same number of moves.
 */
export function remapPosition(pos: number, from: ReplayTimeline, to: ReplayTimeline): number {
  if (from.durationMs <= 0 || to.durationMs <= 0) return 0;
  const p = Math.min(Math.max(0, pos), from.durationMs);
  if (from.starts.length !== to.starts.length) return Math.round((p / from.durationMs) * to.durationMs);
  const a = knots(from);
  const b = knots(to);
  let j = 0;
  while (j < a.length - 1 && a[j + 1] <= p) j++;
  if (j >= a.length - 1) return to.durationMs;
  const span = a[j + 1] - a[j];
  const frac = span > 0 ? (p - a[j]) / span : 0;
  return Math.round(b[j] + frac * (b[j + 1] - b[j]));
}

/**
 * The move that is playing, or the last one that did: the latest whose turn
 * has begun by `posMs`. -1 before the first move starts (so the text isn't
 * lit up on a replay that hasn't begun).
 */
export function activeLeaf(starts: readonly number[], posMs: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] < posMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** A CFOP phase, ending once `moveIndex` moves have been played. */
export interface PhaseMark {
  label: string;
  moveIndex: number;
}

/** Drops empty phases (skips), and makes the last one run to the final move. Fewer than two left means nothing worth drawing. */
function tidyMarks(marks: PhaseMark[], moveCount: number): PhaseMark[] {
  const out: PhaseMark[] = [];
  let prev = 0;
  for (const m of marks) {
    const idx = Math.min(Math.max(m.moveIndex, 0), moveCount);
    if (idx <= prev) continue;
    out.push({ label: m.label, moveIndex: idx });
    prev = idx;
  }
  if (out.length < 2) return [];
  out[out.length - 1] = { ...out[out.length - 1], moveIndex: moveCount };
  return out;
}

/**
 * Phase boundaries from a smart-cube solve's recorded milestones (ms on the
 * same clock as `timestamps`, one per move): the moves up to each milestone
 * belong to that phase, and PLL is whatever remains.
 */
export function phaseMarksFromMilestones(
  timestamps: readonly number[],
  ms: { crossAtMs: number | null; f2lAtMs: number | null; ollAtMs: number | null },
): PhaseMark[] {
  const upTo = (at: number) => timestamps.filter((t) => t <= at).length;
  const marks: PhaseMark[] = [];
  if (ms.crossAtMs !== null) marks.push({ label: "Cross", moveIndex: upTo(ms.crossAtMs) });
  if (ms.f2lAtMs !== null) marks.push({ label: "F2L", moveIndex: upTo(ms.f2lAtMs) });
  if (ms.ollAtMs !== null) marks.push({ label: "OLL", moveIndex: upTo(ms.ollAtMs) });
  marks.push({ label: "PLL", moveIndex: timestamps.length });
  return tidyMarks(marks, timestamps.length);
}

/** Phase boundaries from an analysis' phase list (several F2L pairs read as one F2L). */
export function phaseMarksFromPhases(phases: readonly { phase: string; moves: readonly unknown[] }[]): PhaseMark[] {
  const names: Record<string, string> = { cross: "Cross", f2l: "F2L", oll: "OLL", pll: "PLL" };
  const marks: PhaseMark[] = [];
  let count = 0;
  for (const p of phases) {
    count += p.moves.length;
    const label = names[p.phase] ?? p.phase;
    const last = marks[marks.length - 1];
    if (last && last.label === label) last.moveIndex = count;
    else marks.push({ label, moveIndex: count });
  }
  return tidyMarks(marks, count);
}

export interface PhaseSegment {
  label: string;
  startMs: number;
  endMs: number;
}

/** Where each phase sits on a timeline: it ends when its last move's turn does, and the next begins from there. */
export function markSegments(marks: readonly PhaseMark[], timeline: ReplayTimeline): PhaseSegment[] {
  const out: PhaseSegment[] = [];
  let start = 0;
  marks.forEach((m, i) => {
    const last = i === marks.length - 1;
    const end = last ? timeline.durationMs : m.moveIndex > 0 ? (timeline.ends[Math.min(m.moveIndex, timeline.ends.length) - 1] ?? timeline.durationMs) : 0;
    out.push({ label: m.label, startMs: start, endMs: end });
    start = end;
  });
  return out;
}
