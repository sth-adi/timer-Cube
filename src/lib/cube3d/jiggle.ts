import { isSliceMove, moveGeometry, parseMove, type MoveSpec } from "@/lib/cube-engine/stickerTurns";

/**
 * Slight secondary motion for the 3D cube, as pure functions of time so nothing is simulated: a replay can scrub to any
 * position and get the exact same picture, and the live cube only needs to know when its last turn ended.
 *
 * Two parts, both small on purpose:
 *  - a wobble of the whole cube after a turn lands: a damped sine about the axis perpendicular to the turn, first swing
 *    in the turn's direction, zero at the instant the turn ends (so it joins the turn's own settle without a jump),
 *    gone after WOBBLE_MS. Stronger for fast turns and for half turns; whole-cube rotations give none.
 *  - a tilt of the turning layer off its axis while it turns (a layer wobbles a little in its track), bell-shaped over the turn.
 * Axes are the three.js axes of the cube's own frame (0 x, 1 y, 2 z), the same as cubieTurns uses.
 */

/** Largest whole-cube wobble, in degrees (a fast half turn). */
export const WOBBLE_MAX_DEG = 3;
/** How long a wobble lasts (ms): it has decayed to nothing by then. */
export const WOBBLE_MS = 340;
/** One full swing of the wobble (ms) and how fast it dies away (decay time constant, ms). */
const WOBBLE_PERIOD_MS = 170;
const WOBBLE_TAU_MS = 100;
/** Largest tilt of a turning layer off its axis, in degrees. */
export const TILT_MAX_DEG = 1.2;

const RAD = Math.PI / 180;

/** The turn speeds the strength scale runs between: a turn this slow is the weakest kick, this fast the strongest. */
const SLOW_TURN_MS = 220;
const FAST_TURN_MS = 60;

export interface JiggleKick {
  /** the axis the cube rocks about (perpendicular to the turn's own axis) */
  axis: 0 | 1 | 2;
  /** +1 or -1: the way round the first swing goes, following the turn's direction */
  dir: 1 | -1;
  /** 0..1 of WOBBLE_MAX_DEG */
  strength: number;
}

/** A kick and when its turn ended (ms on the caller's clock). */
export interface JiggleEvent {
  endMs: number;
  kick: JiggleKick;
}

/** What Cube3D is told to draw: the whole cube's wobble as a small rotation vector (radians, cube frame). Present means layer tilt is on too. */
export interface CubeJiggle {
  wobble: readonly [number, number, number];
}

export const REST_JIGGLE: CubeJiggle = { wobble: [0, 0, 0] };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Unnormalised swing shape: zero at 0, damped sine, faded out smoothly over the last quarter so it ends exactly at 0. */
function swing(ageMs: number): number {
  if (!(ageMs > 0) || ageMs >= WOBBLE_MS) return 0;
  const env = Math.exp(-ageMs / WOBBLE_TAU_MS);
  const osc = Math.sin((2 * Math.PI * ageMs) / WOBBLE_PERIOD_MS);
  return env * osc * (1 - smoothstep(WOBBLE_MS * 0.72, WOBBLE_MS, ageMs));
}

/** The swing's largest excursion, so `strength` 1 reaches exactly WOBBLE_MAX_DEG. */
const SWING_PEAK = (() => {
  let peak = 0;
  for (let t = 0; t < WOBBLE_MS; t += 0.1) peak = Math.max(peak, Math.abs(swing(t)));
  return peak || 1;
})();

/** The wobble angle (radians, signed along the kick's direction) `ageMs` after the turn ended. Zero at age 0 and from WOBBLE_MS on. */
export function wobbleAngle(ageMs: number, strength: number): number {
  return (clamp01(strength) * WOBBLE_MAX_DEG * RAD * swing(ageMs)) / SWING_PEAK;
}

/**
 * The kick a finished turn gives the cube, or null for a whole-cube rotation (or no turn). `durationMs` is how long the turn
 * took to draw: quick turns hit harder. A half turn hits harder than a quarter.
 */
export function turnKick(turn: MoveSpec | null, durationMs: number): JiggleKick | null {
  if (!turn) return null;
  if (isSliceMove(turn) && (turn.slice === "x" || turn.slice === "y" || turn.slice === "z")) return null;
  const geo = moveGeometry(turn);
  const degrees = geo.parts[0]?.degrees ?? 0;
  if (!degrees) return null;
  const speed = clamp01((SLOW_TURN_MS - (Number.isFinite(durationMs) ? durationMs : SLOW_TURN_MS)) / (SLOW_TURN_MS - FAST_TURN_MS));
  const half = Math.abs(degrees) >= 180 ? 1.25 : 1;
  const strength = clamp01((0.35 + 0.45 * speed) * half);
  // three.js turn sense: the y flip of the CSS axes (see cubieTurns) makes x and z turns run the other way
  const dir = (geo.axis === 1 ? 1 : -1) * Math.sign(degrees) > 0 ? 1 : -1;
  return { axis: ((geo.axis + 2) % 3) as 0 | 1 | 2, dir, strength };
}

/** Every finished move of a replay as a kick event (rotations skipped), in time order. A double played as two quarters kicks once, as the half turn, when its second quarter lands. */
export function buildJiggleEvents(
  tokens: readonly string[],
  starts: readonly number[],
  ends: readonly number[],
  halves?: readonly ({ firstStart: number; secondEnd: number } | null | undefined)[],
): JiggleEvent[] {
  const out: JiggleEvent[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const move = parseMove(tokens[k] ?? "");
    const h = halves?.[k];
    const endMs = h ? h.secondEnd : ends[k];
    const startMs = h ? h.firstStart : starts[k];
    if (!move || endMs === undefined || startMs === undefined) continue;
    const kick = turnKick(h ? ({ ...move, quarters: 2 } as MoveSpec) : move, endMs - startMs);
    if (kick) out.push({ endMs, kick });
  }
  out.sort((a, b) => a.endMs - b.endMs);
  return out;
}

/**
 * The whole cube's wobble at `nowMs` as a rotation vector (radians about x, y, z of the cube's frame): the sum of the kicks of
 * the turns that ended within the last WOBBLE_MS, so a run of quick turns flows into one another with no jump at each end.
 * `timeScale` stretches the wobble in the caller's clock (a replay at speed 0.5 passes 0.5 so the wobble still lasts as long on screen).
 */
export function wobbleAt(events: readonly JiggleEvent[], nowMs: number, timeScale = 1): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  const scale = timeScale > 0 ? timeScale : 1;
  // last event that has ended by nowMs
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].endMs <= nowMs) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) {
    const age = (nowMs - events[i].endMs) / scale;
    if (age >= WOBBLE_MS) break;
    const { axis, dir, strength } = events[i].kick;
    out[axis] += dir * wobbleAngle(age, strength);
  }
  return out;
}

/** The tilt of a turning layer off its axis: axis (three.js) and angle (radians), bell-shaped over `progress` 0..1; null for a whole-cube rotation. */
export function layerTilt(turn: MoveSpec | null, progress: number): { axis: 0 | 1 | 2; angle: number } | null {
  if (!turn) return null;
  if (isSliceMove(turn) && (turn.slice === "x" || turn.slice === "y" || turn.slice === "z")) return null;
  const geo = moveGeometry(turn);
  const degrees = geo.parts[0]?.degrees ?? 0;
  if (!degrees) return null;
  const s = Math.sin(Math.PI * clamp01(progress));
  const dir = (geo.axis === 1 ? 1 : -1) * Math.sign(degrees);
  return { axis: ((geo.axis + 1) % 3) as 0 | 1 | 2, angle: dir * TILT_MAX_DEG * RAD * s * s };
}
