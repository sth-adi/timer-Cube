/**
 * Orientation math for a gyro-equipped smart cube (GAN Gen2+ and MoYu's AI
 * cubes stream an IMU quaternion alongside their moves). Everything here is
 * pure and synchronous so it can be unit-tested against synthetic quaternion
 * streams — no Bluetooth needed.
 *
 * Frames (all right-handed):
 *  - **viewer** — fixed to the person holding the cube: x = their right,
 *    y = up, z = toward them. Rotation tokens (x, y, z…) are defined here.
 *  - **body** — fixed to the physical cube, in the standard white-top,
 *    green-front frame the move stream itself uses (a smart cube names every
 *    turn by its physical center color, so "U" is always the white face).
 *  - **sensor** — whatever axes the cube's IMU chip happens to report in.
 *    Differs by brand, so a per-protocol `GyroCalibration` maps sensor → body.
 *
 * Rotations are 3×3 matrices (row-major `number[9]`) rather than
 * quaternions past the input boundary: snapping to the 24 cube orientations,
 * comparing them, and mapping face normals are all simpler and less
 * error-prone as matrix products.
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Row-major 3×3 rotation matrix. */
export type Mat3 = readonly number[];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function transpose(a: Mat3): Mat3 {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

export function apply(m: Mat3, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Angle (degrees) of the rotation taking `a` to `b` — 0 when they're the same orientation. */
export function angleBetween(a: Mat3, b: Mat3): number {
  const d = mul(transpose(a), b);
  const cos = Math.max(-1, Math.min(1, (d[0] + d[4] + d[8] - 1) / 2));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function quatToMat(q: Quat): Mat3 {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const x = q.x / n;
  const y = q.y / n;
  const z = q.z / n;
  const w = q.w / n;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

export function matToQuat(m: Mat3): Quat {
  const trace = m[0] + m[4] + m[8];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return { w: s / 4, x: (m[7] - m[5]) / s, y: (m[2] - m[6]) / s, z: (m[3] - m[1]) / s };
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    return { w: (m[7] - m[5]) / s, x: s / 4, y: (m[1] + m[3]) / s, z: (m[2] + m[6]) / s };
  }
  if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    return { w: (m[2] - m[6]) / s, x: (m[1] + m[3]) / s, y: s / 4, z: (m[5] + m[7]) / s };
  }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return { w: (m[3] - m[1]) / s, x: (m[2] + m[6]) / s, y: (m[5] + m[7]) / s, z: s / 4 };
}

/** Right-handed rotation of `deg` degrees about a coordinate axis. */
export function axisRotation(axis: "x" | "y" | "z", deg: number): Mat3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(t) * 1e12) / 1e12;
  const s = Math.round(Math.sin(t) * 1e12) / 1e12;
  if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * Whole-cube rotation tokens in the viewer frame. Each turns the whole cube
 * the way its namesake face turn goes: x like R (front → up), y like U
 * (front → left), z like F (up → right) — i.e. −90° about that axis.
 */
export const ROTATION_TOKENS = ["y", "y'", "y2", "x", "x'", "x2", "z", "z'", "z2"] as const;
export type RotationToken = (typeof ROTATION_TOKENS)[number];

export function tokenMatrix(token: string): Mat3 {
  const axis = token[0] as "x" | "y" | "z";
  const deg = token.endsWith("2") ? 180 : token.endsWith("'") ? 90 : -90;
  return axisRotation(axis, deg);
}

/** Composes a space-separated rotation sequence ("x2 y'") into one matrix. Viewer-frame tokens stack left: "a b" = M_b · M_a. */
export function sequenceMatrix(seq: string): Mat3 {
  return seq
    .split(/\s+/)
    .filter(Boolean)
    .reduce<Mat3>((acc, t) => mul(tokenMatrix(t), acc), IDENTITY);
}

function roundMat(m: Mat3): Mat3 {
  return m.map((v) => Math.round(v));
}

function matKey(m: Mat3): string {
  return roundMat(m).join(",");
}

/** All 24 orientations of a cube, as exact signed-permutation matrices. Index 0 is identity. */
export const CUBE_ORIENTATIONS: readonly Mat3[] = (() => {
  const seen = new Map<string, Mat3>([[matKey(IDENTITY), IDENTITY]]);
  const queue: Mat3[] = [IDENTITY];
  const gens = [tokenMatrix("x"), tokenMatrix("y")];
  while (queue.length > 0) {
    const m = queue.shift()!;
    for (const g of gens) {
      const next = roundMat(mul(g, m));
      const key = matKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
})();

export function orientationIndex(m: Mat3): number {
  const key = matKey(m);
  return CUBE_ORIENTATIONS.findIndex((o) => matKey(o) === key);
}

/** Nearest of the 24 cube orientations to an arbitrary (noisy) rotation, and how far off it is. */
export function snapOrientation(m: Mat3): { index: number; errorDeg: number } {
  let best = 0;
  let bestErr = Infinity;
  for (let i = 0; i < CUBE_ORIENTATIONS.length; i++) {
    const err = angleBetween(CUBE_ORIENTATIONS[i], m);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return { index: best, errorDeg: bestErr };
}

/**
 * Shortest rotation-token spelling of the viewer-frame rotation `m`
 * (one of the 24): "" for none, a single token when one exists, else two.
 * y-first spellings win ties since that's how cubers conventionally write
 * a regrip ("y x'" rather than "z y").
 */
export function nameRotation(m: Mat3): string {
  const key = matKey(m);
  if (key === matKey(IDENTITY)) return "";
  for (const t of ROTATION_TOKENS) if (matKey(tokenMatrix(t)) === key) return t;
  for (const a of ROTATION_TOKENS) {
    for (const b of ROTATION_TOKENS) {
      if (a[0] === b[0]) continue;
      if (matKey(mul(tokenMatrix(b), tokenMatrix(a))) === key) return `${a} ${b}`;
    }
  }
  return "?";
}

/** Physical face letter → its outward normal in the body frame. */
export const FACE_NORMALS: Record<string, [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export const FACE_COLOR_NAMES: Record<string, string> = {
  U: "white",
  D: "yellow",
  R: "red",
  L: "orange",
  F: "green",
  B: "blue",
};

function faceForVector(v: readonly number[]): string {
  let bestFace = "U";
  let bestDot = -Infinity;
  for (const [face, n] of Object.entries(FACE_NORMALS)) {
    const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
    if (dot > bestDot) {
      bestDot = dot;
      bestFace = face;
    }
  }
  return bestFace;
}

/** Which physical (body) face currently points at a viewer direction, given orientation A (body → viewer). */
export function physicalFaceAt(orientation: Mat3, viewerFace: string): string {
  return faceForVector(apply(transpose(orientation), FACE_NORMALS[viewerFace]));
}

/** Human label for an orientation, e.g. "yellow top · green front". */
export function orientationLabel(orientation: Mat3): string {
  return `${FACE_COLOR_NAMES[physicalFaceAt(orientation, "U")]} top · ${FACE_COLOR_NAMES[physicalFaceAt(orientation, "F")]} front`;
}

/**
 * Re-expresses a physical move (named by center color, as the smart cube
 * reports it) in the viewer's own frame — so after a `y`, turning the blue
 * face with your right hand reads as the "R" you actually did, not "B".
 * Direction and amount carry over unchanged: clockwise-facing-the-face is
 * the same turn whichever way that face happens to point.
 */
export function viewerMove(physicalToken: string, orientation: Mat3): string {
  const face = physicalToken[0];
  const normal = FACE_NORMALS[face];
  if (!normal) return physicalToken;
  return faceForVector(apply(orientation, normal)) + physicalToken.slice(1);
}

/**
 * The standard grip used as the gyro's reference ("home"): yellow top, green
 * front — the white-cross-on-bottom hold CFOP solvers actually use, which
 * is a z2 away from the white-top body frame.
 */
export const HOME_ORIENTATION: Mat3 = roundMat(tokenMatrix("z2"));

/**
 * Maps one protocol's raw IMU quaternions into the body frame.
 * `map` is a row-major signed permutation (sensor → body, det +1);
 * `conjugate` flips the quaternion's handedness convention for chips that
 * report world → body instead of body → world.
 */
export interface GyroCalibration {
  map: number[];
  conjugate: boolean;
}

/**
 * GAN's documented convention (their own sample code swizzles the raw
 * quaternion as (x, z, −y, w) into a Y-up frame) — the default until a
 * cube is calibrated, and the right answer for GAN Gen2+ cubes out of the box.
 */
export const DEFAULT_CALIBRATION: GyroCalibration = { map: [1, 0, 0, 0, 0, 1, 0, -1, 0], conjugate: false };

function rawMat(q: Quat, calibration: GyroCalibration): Mat3 {
  return quatToMat(calibration.conjugate ? { x: -q.x, y: -q.y, z: -q.z, w: q.w } : q);
}

/**
 * The cube's absolute orientation (body → viewer) at a sample, given the
 * raw quaternion captured while it was held in the HOME grip.
 */
export function orientationFromQuat(q: Quat, ref: Quat, calibration: GyroCalibration): Mat3 {
  const deltaSensor = mul(transpose(rawMat(ref, calibration)), rawMat(q, calibration));
  const m = calibration.map;
  const deltaBody = mul(mul(m, deltaSensor), transpose(m));
  return mul(HOME_ORIENTATION, deltaBody);
}

/** All 24 proper signed permutations, i.e. every way a sensor chip could be mounted square to the cube's axes. */
const SENSOR_MOUNTINGS: readonly Mat3[] = CUBE_ORIENTATIONS;

export interface CalibrationResult {
  calibration: GyroCalibration;
  /** Summed misfit (degrees) of the winning model against both captured poses — a sanity signal for the UI. */
  errorDeg: number;
}

/**
 * Learns how a cube's IMU is mounted from three captured poses: the HOME
 * grip, then a `y`, then (without going back) an `x`. Tries every square
 * mounting × both quaternion conventions and keeps the one that predicts
 * both poses best. Two non-commuting rotations are needed: one alone can't
 * tell a mounting apart from its handedness-flipped twin.
 *
 * Returns null when nothing fits within tolerance — usually a sloppy
 * rotation or the wrong one done — so the wizard can ask for a retry
 * instead of silently saving garbage.
 */
export function solveCalibration(home: Quat, afterY: Quat, afterYX: Quat, toleranceDeg = 50): CalibrationResult | null {
  const expected1 = sequenceMatrix("y");
  const expected2 = sequenceMatrix("y x");
  let best: CalibrationResult | null = null;
  for (const conjugate of [false, true]) {
    for (const mounting of SENSOR_MOUNTINGS) {
      const calibration = { map: [...mounting], conjugate };
      const a1 = mul(orientationFromQuat(afterY, home, calibration), transpose(HOME_ORIENTATION));
      const a2 = mul(orientationFromQuat(afterYX, home, calibration), transpose(HOME_ORIENTATION));
      const errorDeg = angleBetween(a1, expected1) + angleBetween(a2, expected2);
      if (!best || errorDeg < best.errorDeg) best = { calibration, errorDeg };
    }
  }
  return best && best.errorDeg <= toleranceDeg ? best : null;
}

export interface GyroSample {
  /** Same clock as the move stream's timestamps. */
  atMs: number;
  q: Quat;
}

export interface OrientationSegment {
  /** When the cube settled into this orientation (for the first segment: the first sample). */
  fromMs: number;
  orientation: Mat3;
}

export interface DetectedRotation {
  /** When the cube started leaving the previous orientation. */
  atMs: number;
  token: string;
}

/** How close (degrees) a pose must be to one of the 24 orientations to count as "in" it — well under the 45° midpoint, so there's real hysteresis between neighbours. */
export const SNAP_DEG = 30;
/** How long (ms) a new orientation has to hold before it counts — rides out the brief pass through y on the way to a y2, and hand wobble mid-turn. */
export const SETTLE_MS = 120;

/**
 * Incremental rotation detector — feed it samples one at a time as they
 * stream in (the live twin does this) or all at once after a solve (see
 * detectRotations). Wobble while turning (the core shakes a few degrees on
 * every flick) never leaves the snap zone, so it never registers; a quick
 * y2 passes through y too briefly to settle, so it reads as one y2 rather
 * than y y.
 */
export class RotationTracker {
  private current: number | null = null;
  private lastInCurrentAt = 0;
  private candidate: { index: number; since: number } | null = null;

  constructor(
    private readonly ref: Quat,
    private readonly calibration: GyroCalibration,
  ) {}

  push(sample: GyroSample): {
    /** The raw (unsnapped) orientation — what a live view should draw. */
    orientation: Mat3;
    /** Set on the first sample and whenever a new orientation settles. */
    segment?: OrientationSegment;
    /** Set when a whole-cube rotation just completed. */
    rotation?: DetectedRotation;
  } {
    const orientation = orientationFromQuat(sample.q, this.ref, this.calibration);
    const { index, errorDeg } = snapOrientation(orientation);
    if (this.current === null) {
      this.current = index;
      this.lastInCurrentAt = sample.atMs;
      return { orientation, segment: { fromMs: sample.atMs, orientation: CUBE_ORIENTATIONS[index] } };
    }
    if (index === this.current || errorDeg >= SNAP_DEG) {
      if (index === this.current && errorDeg < SNAP_DEG) this.lastInCurrentAt = sample.atMs;
      this.candidate = null;
      return { orientation };
    }
    if (!this.candidate || this.candidate.index !== index) this.candidate = { index, since: sample.atMs };
    if (sample.atMs - this.candidate.since < SETTLE_MS) return { orientation };

    const from = CUBE_ORIENTATIONS[this.current];
    const to = CUBE_ORIENTATIONS[index];
    const rotation = { atMs: this.lastInCurrentAt, token: nameRotation(roundMat(mul(to, transpose(from)))) };
    const segment = { fromMs: this.candidate.since, orientation: to };
    this.current = index;
    this.lastInCurrentAt = sample.atMs;
    this.candidate = null;
    return { orientation, segment, rotation };
  }
}

/** Runs a whole recorded gyro stream through a RotationTracker: every settled orientation, and the rotations between them. */
export function detectRotations(
  samples: readonly GyroSample[],
  ref: Quat,
  calibration: GyroCalibration,
): { segments: OrientationSegment[]; rotations: DetectedRotation[] } {
  const tracker = new RotationTracker(ref, calibration);
  const segments: OrientationSegment[] = [];
  const rotations: DetectedRotation[] = [];
  for (const s of samples) {
    const out = tracker.push(s);
    if (out.segment) segments.push(out.segment);
    if (out.rotation) rotations.push(out.rotation);
  }
  return { segments, rotations };
}

/** The settled orientation in effect at a moment — the latest segment that had started by then. */
export function orientationAt(segments: readonly OrientationSegment[], atMs: number): Mat3 {
  let o = segments[0]?.orientation ?? HOME_ORIENTATION;
  for (const seg of segments) {
    if (seg.fromMs <= atMs) o = seg.orientation;
    else break;
  }
  return o;
}

/**
 * The rotation-aware reconstruction: the inspection rotation that takes the
 * scramble's white-top/green-front frame to how the solve was actually
 * held, then every move re-expressed in the solver's own frame, with each
 * mid-solve regrip inserted exactly where it happened. The result reads the
 * way a cuber would write their solve by hand ("z2 D' R F …  y  R U R'"),
 * and replaying scramble + this on any standard sim ends solved.
 *
 * `moveTimesMs` / rotation times must share one clock.
 */
export function orientedReconstruction(
  physicalTokens: readonly string[],
  moveTimesMs: readonly number[],
  segments: readonly OrientationSegment[],
  rotations: readonly DetectedRotation[],
  solveStartMs: number,
): { tokens: string[]; inspection: string; startOrientation: Mat3 } {
  const startOrientation = orientationAt(segments, solveStartMs);
  const inspection = nameRotation(roundMat(startOrientation));
  const tokens: string[] = inspection ? inspection.split(" ") : [];
  const midSolve = rotations.filter((r) => r.atMs > solveStartMs);
  let r = 0;
  for (let i = 0; i < physicalTokens.length; i++) {
    const t = moveTimesMs[i] ?? solveStartMs;
    while (r < midSolve.length && midSolve[r].atMs <= t) {
      tokens.push(...midSolve[r].token.split(" "));
      r++;
    }
    tokens.push(viewerMove(physicalTokens[i], orientationAt(segments, t)));
  }
  return { tokens, inspection, startOrientation };
}

/**
 * CSS `matrix3d()` for showing a body-frame cube (built with the white face
 * on top) in orientation `m`. CSS's y axis points down, so the math-frame
 * rotation is conjugated by a y flip; matrix3d itself is column-major.
 */
export function cssMatrix3d(m: Mat3): string {
  const c = [m[0], -m[1], m[2], -m[3], m[4], -m[5], m[6], -m[7], m[8]];
  const f = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
  return `matrix3d(${f(c[0])},${f(c[3])},${f(c[6])},0,${f(c[1])},${f(c[4])},${f(c[7])},0,${f(c[2])},${f(c[5])},${f(c[8])},0,0,0,0,1)`;
}
