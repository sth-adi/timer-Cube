import { solveMsAtPosition } from "@/lib/gyro/replayGyro";
import { formatTime } from "@/lib/utils/time";
import { EVENT_TAGS, solveFinalMs, type EventTag, type Solve } from "@/types";
import type { PhaseMark } from "./replayTiming";

/**
 * The pure parts of the replay stage (components/replay): the move grid's layout, which phase the header
 * names, the stackmat's clock and the end card's wording. Nothing here touches the DOM.
 */

export interface MoveGridLayout {
  cols: number;
  rows: number;
  /** Move text size for a grid `widthPx` wide. */
  fontPx: number;
}

/** A cell needs about this much width at the smallest legible size, so it caps how many columns fit. */
const MIN_CELL_PX = 26;
/** Rows the grid aims for: three, like the reference, more only when the solve is too long to fit at a legible size. */
const TARGET_ROWS = 3;
const MIN_COLS = 6;
const MIN_FONT_PX = 10;
const MAX_FONT_PX = 24;

/** Rows and columns for `count` moves in `widthPx`: about three rows, 6 or more columns, text sized to the cell. */
export function moveGridLayout(count: number, widthPx: number): MoveGridLayout {
  const width = Math.max(120, widthPx);
  const maxCols = Math.max(MIN_COLS, Math.floor(width / MIN_CELL_PX));
  const cols = Math.min(maxCols, Math.max(MIN_COLS, Math.ceil(Math.max(count, 1) / TARGET_ROWS)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const fontPx = Math.round(Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, (width / cols) * 0.46)) * 10) / 10;
  return { cols, rows, fontPx };
}

export type MoveState = "played" | "current" | "upcoming";

/** How move `index` reads when move `current` is the one playing (-1: none has started): played ones bright, upcoming ones dim. */
export function moveState(index: number, current: number): MoveState {
  if (index === current) return "current";
  return index < current ? "played" : "upcoming";
}

/** The phase `activeMove` (a raw move index, -1 before the first) falls in; null when there are no marks. */
export function phaseAt(marks: readonly PhaseMark[] | undefined, activeMove: number): string | null {
  if (!marks || marks.length === 0) return null;
  const at = Math.max(0, activeMove);
  for (const m of marks) if (at < m.moveIndex) return m.label;
  return marks[marks.length - 1].label;
}

/** "07 / 32": the count padded to the total's width, so the header doesn't shift as it climbs. */
export function moveCounter(done: number, total: number): string {
  const width = String(total).length;
  const d = Math.min(Math.max(done, 0), total);
  return `${String(d).padStart(width, "0")} / ${total}`;
}

/** The big end-card time: "2.516", "1:02.516" (three decimals; the unit is drawn separately). */
export function bigTime(ms: number): string {
  return formatTime(ms, 3);
}

/**
 * What the stackmat's LCD shows: five cells (minutes, tens of seconds, seconds, tenths, hundredths) and
 * whether the colon is lit. A stackmat truncates, never rounds, so 2.516 reads 2.51. Leading cells are blank.
 */
export interface LcdReading {
  cells: (number | null)[];
  colon: boolean;
}

export function lcdReading(ms: number): LcdReading {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const totalSec = Math.floor(cs / 100);
  const minutes = Math.min(9, Math.floor(totalSec / 60));
  const sec = totalSec % 60;
  const hundredths = cs % 100;
  return {
    cells: [minutes > 0 ? minutes : null, minutes > 0 || sec >= 10 ? Math.floor(sec / 10) : null, sec % 10, Math.floor(hundredths / 10), hundredths % 10],
    colon: minutes > 0,
  };
}

/** Segments (a to g, clockwise from the top, g in the middle) lit for each digit on a seven-segment display. */
export const SEVEN_SEGMENTS: Record<number, string> = {
  0: "abcdef",
  1: "bc",
  2: "abdeg",
  3: "abcdg",
  4: "bcfg",
  5: "acdfg",
  6: "acdefg",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
};

/** The time on the stackmat when the replay is `positionMs` along its own clock. */
export function stageClockMs(opts: {
  positionMs: number;
  durationMs: number;
  atEnd: boolean;
  /** The replay's move starts, and when each move was really made: with both the clock is the solve's own. */
  starts?: readonly number[];
  moveMs?: readonly number[];
  /** The time the stackmat stops on, when it isn't just the replay's length. */
  finalMs?: number;
}): number {
  const { positionMs, durationMs, atEnd, starts, moveMs, finalMs } = opts;
  if (atEnd) return finalMs ?? durationMs;
  const pos = Math.min(Math.max(positionMs, 0), durationMs);
  // The replay opens on the first move; the stackmat opens at zero, not at the time that move was really made.
  if (pos <= 0) return 0;
  if (starts && moveMs && moveMs.length > 0) {
    const real = solveMsAtPosition(starts, moveMs, pos);
    return finalMs !== undefined ? Math.min(real, finalMs) : real;
  }
  return finalMs !== undefined && durationMs > 0 ? (pos / durationMs) * finalMs : pos;
}

/** The italic line under the big time: "3x3 Single", or the tag's name for a one-handed, feet or blind solve. */
export function eventCaption(puzzleLabel: string, tag?: EventTag | string | null): string {
  const tagLabel = tag ? EVENT_TAGS.find((e) => e.id === tag)?.label : undefined;
  return `${puzzleLabel} ${tagLabel ?? "Single"}`;
}

/** True when this solve beat every earlier solve of the same event (and there was at least one to beat). */
export function isPersonalBest(solves: readonly Solve[], target: { id?: string; timeMs: number; penalty?: Solve["penalty"]; date?: number; event?: EventTag }): boolean {
  const mine = solveFinalMs({ timeMs: target.timeMs, penalty: target.penalty ?? "none" });
  if (mine === null) return false;
  let others = 0;
  for (const s of solves) {
    if (s.id === target.id) continue;
    if (s.event !== target.event) continue;
    if (target.date !== undefined && s.date >= target.date) continue;
    const ms = solveFinalMs(s);
    if (ms === null) continue;
    others++;
    if (ms <= mine) return false;
  }
  return others > 0;
}

/** Moves per second, for the end card. */
export function tpsLabel(moveCount: number, ms: number): string | null {
  if (moveCount < 1 || !(ms > 0)) return null;
  return `${(moveCount / (ms / 1000)).toFixed(1)} TPS`;
}

const TURN_BLUR_MIN_PX = 0.5;
const TURN_BLUR_MAX_PX = 2;
/** Turn speed (degrees per second) the blur starts to grow past, and the extra speed that adds a pixel. */
const BLUR_FLOOR_DPS = 300;
const BLUR_DPS_PER_PX = 450;

/**
 * Motion blur for the cube while a quarter turn takes `turnMs` of replay time at playback `speed`: half a
 * pixel for a gentle turn up to two for a fast one. Zero when nothing is turning.
 */
export function turnBlurPx(turnMs: number, speed: number): number {
  if (!(turnMs > 0) || !(speed > 0)) return 0;
  const dps = (90 * speed) / (turnMs / 1000);
  const px = TURN_BLUR_MIN_PX + (dps - BLUR_FLOOR_DPS) / BLUR_DPS_PER_PX;
  return Math.round(Math.min(TURN_BLUR_MAX_PX, Math.max(TURN_BLUR_MIN_PX, px)) * 10) / 10;
}

/** Everything the stage needs that isn't live: what is read, what the stackmat stops on and what the end card says. */
export interface ReplayStageInfo {
  /** The tokens the grid shows (slice pairs merged), each remembering which raw moves it covers. */
  moves: readonly { token: string; first: number; last: number }[];
  /** Phase ticks, to name the phase in the header; none for a single phase or an untimed solve. */
  marks?: readonly PhaseMark[];
  /** Header's left words: "Reconstruction". */
  title?: string;
  /** What the stackmat stops on (raw clock time), and what the end card prints (with any penalty). */
  clockMs?: number;
  /** The big end-card figure ("2.516", "DNF"). */
  resultLabel: string;
  /** The small unit beside it: "s" by default for a figure, "" for none ("DNF"), or e.g. "turns" when there is no time. */
  resultUnit?: string;
  /** The italic line, e.g. "3x3 Single" or "Personal best". */
  caption: string;
  /** Tiny lines under the rule: date, moves, TPS. */
  meta: string[];
  /** When each raw move was really made, ms from the start: lets the stackmat run on the solve's own clock. */
  moveMs?: readonly number[];
}
