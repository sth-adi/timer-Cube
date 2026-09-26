import { newCube } from "@/lib/cube-engine/engine";
import { IDENTITY } from "@/lib/gyro/orientation";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { MILESTONES, milestoneTimes } from "@/lib/pacer/pacer";
import type { SharedSolve } from "@/lib/social/shareSolve";
import type { Solve } from "@/types";

/**
 * Ghost Race: race a real solve, move for move — one of yours, a friend's
 * shared solve link, or any reconstruction pasted in (a world record
 * included). The ghost plays its actual turns at its actual pace from
 * your first turn, and at every milestone (cross, each pair, OLL, solved)
 * you see who got there first and by how much.
 *
 * Moves are physical (center-color) turns in the engine frame — WCA
 * scramble orientation, white top, green front — like a smart-cube solve.
 */

export type GhostSource = "mine" | "shared" | "pasted";

export interface Ghost {
  source: GhostSource;
  label: string;
  scramble: string;
  moves: string[];
  /** Ms from the ghost's first turn for each move. */
  timesMs: number[];
  totalMs: number;
  date?: number;
  /** No real per-move timing — turns spread evenly over the total. */
  evenlyPaced: boolean;
}

function solvesIt(scramble: string, moves: readonly string[]): boolean {
  const c = newCube();
  if (scramble.trim()) c.move(scramble);
  if (moves.length) c.move(moves.join(" "));
  return c.isSolved();
}

const evenly = (n: number, totalMs: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 1) / n) * totalMs));

export function ghostFromSolve(s: Solve): Ghost {
  const moves = s.reconstruction!.split(/\s+/).filter(Boolean);
  return {
    source: "mine",
    label: `Your ${(s.timeMs / 1000).toFixed(2)} from ${new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    scramble: s.scramble,
    moves,
    timesMs: s.moveTimestamps!,
    totalMs: s.timeMs,
    date: s.date,
    evenlyPaced: false,
  };
}

/** A shared-solve link or bare id → the id. */
export function sharedIdFrom(input: string): string | null {
  const t = input.trim();
  const m = t.match(/\/solve\/([A-Za-z0-9]+)/) ?? t.match(/^([A-Za-z0-9]{6,})$/);
  return m ? m[1] : null;
}

export function ghostFromShared(sh: SharedSolve): Ghost | { error: string } {
  if (sh.puzzle && sh.puzzle !== "333") return { error: "That shared solve isn't a 3x3 solve." };
  let moves = sh.reconstruction.split(/\s+/).filter(Boolean);
  if (!solvesIt(sh.scramble, moves)) moves = toPhysicalTurns(sh.reconstruction, IDENTITY).turns;
  if (!solvesIt(sh.scramble, moves)) return { error: "That shared solve's reconstruction doesn't solve its scramble." };
  const timed = !!sh.moveTimestamps && sh.moveTimestamps.length === moves.length;
  return {
    source: "shared",
    label: `${sh.username ?? "A friend"}'s ${(sh.timeMs / 1000).toFixed(2)}`,
    scramble: sh.scramble,
    moves,
    timesMs: timed ? sh.moveTimestamps! : evenly(moves.length, sh.timeMs),
    totalMs: sh.timeMs,
    evenlyPaced: !timed,
  };
}

/**
 * A pasted reconstruction: the first line is the scramble, everything after
 * is the solution in ordinary notation (rotations, wide and slice turns
 * allowed; `//` comments ignored), starting from WCA orientation. With no
 * per-move timing, the turns are spread evenly over `timeSec`.
 */
export function ghostFromText(text: string, timeSec: number, label = "Pasted reconstruction"): Ghost | { error: string } {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").replace(/^\s*(scramble|solution)\s*:/i, "").trim())
    .filter(Boolean);
  if (lines.length < 2) return { error: "Put the scramble on the first line and the solution below it." };
  if (!(timeSec > 0)) return { error: "Add the solve's time in seconds." };
  const scramble = lines[0].replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  const solution = lines.slice(1).join(" ").replace(/[()[\]]/g, " ");
  let moves: string[];
  try {
    moves = toPhysicalTurns(solution, IDENTITY).turns;
    newCube().move(scramble);
  } catch {
    return { error: "Couldn't read that notation." };
  }
  if (!moves.length) return { error: "No solution turns found." };
  if (!solvesIt(scramble, moves)) return { error: "That solution doesn't solve that scramble (check it starts from white top, green front)." };
  const totalMs = Math.round(timeSec * 1000);
  return { source: "pasted", label, scramble, moves, timesMs: evenly(moves.length, totalMs), totalMs, evenlyPaced: true };
}

/** How many of the ghost's turns have happened `t` ms into the race. */
export function ghostTurnsAt(g: Ghost, t: number): number {
  let n = 0;
  while (n < g.timesMs.length && g.timesMs[n] <= t) n++;
  return n;
}

export function ghostMilestones(g: Ghost): (number | null)[] {
  return milestoneTimes({ scramble: g.scramble, moves: g.moves, timesMs: g.timesMs });
}

export interface RaceGap {
  /** Milestones each side has reached by now. */
  mine: number;
  ghost: number;
  /** At the last milestone both reached: your time there minus the ghost's (negative = you were first). */
  deltaMs: number | null;
  milestone: string | null;
  line: string;
}

/** The live state of the race: who's further along, and the split at the last shared milestone. */
export function raceGap(ghostTimes: readonly (number | null)[], mineTimes: readonly (number | null)[], nowMs: number): RaceGap {
  const reached = (ts: readonly (number | null)[]) => ts.filter((x) => x !== null && x <= nowMs).length;
  const mine = reached(mineTimes);
  const ghost = reached(ghostTimes);
  let k = -1;
  for (let i = 0; i < MILESTONES.length; i++) if (mineTimes[i] != null && ghostTimes[i] != null && ghostTimes[i]! <= nowMs) k = i;
  const deltaMs = k >= 0 ? mineTimes[k]! - ghostTimes[k]! : null;
  const milestone = k >= 0 ? MILESTONES[k] : null;
  const s = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(2)}s`;
  const line =
    deltaMs === null || milestone === null
      ? ghost > mine
        ? `Ghost reached ${MILESTONES[ghost - 1]} first`
        : "Neck and neck"
      : Math.abs(deltaMs) < 50
        ? `Level at ${milestone}`
        : deltaMs < 0
          ? `${s(deltaMs)} ahead at ${milestone}`
          : `${s(deltaMs)} behind at ${milestone}`;
  return { mine, ghost, deltaMs, milestone, line };
}
