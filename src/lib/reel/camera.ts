import { HOME_ORIENTATION, matToQuat } from "@/lib/gyro/orientation";
import { buildLeanTurns, cameraMotionAllowed, leanAt, type LeanTurn } from "@/lib/analysis/replayCamera";
import { CAMERA } from "./cube3d";
import { viewAt, type ReelTimeline } from "./timeline";
import { blendQuatInto, quatToMatInto, trackQuatInto } from "./viewTrack";

const Q = new Float64Array(4);
const GRIP = new Float64Array(9);
const ROT = new Float64Array(9);
const SWING = new Float64Array(9);
const SWUNG = new Float64Array(9);

/** The camera leans toward the face being turned (see lib/analysis/replayCamera), a little less when the recorded grip already moves it. */
const LEAN_SHARE = 0.8;
const LEAN_SHARE_WITH_GYRO = 0.4;
const leanTurnsOf = new WeakMap<ReelTimeline, LeanTurn[]>();

function leanTurnsFor(tl: ReelTimeline): LeanTurn[] {
  let turns = leanTurnsOf.get(tl);
  if (!turns) {
    turns = buildLeanTurns(
      tl.moves,
      tl.timesMs.map((t, i) => t - tl.turnMs[i]),
      tl.timesMs,
    );
    leanTurnsOf.set(tl, turns);
  }
  return turns;
}
const HOME_Q = (() => {
  const q = matToQuat(HOME_ORIENTATION);
  return new Float64Array([q.x, q.y, q.z, q.w]);
})();

/**
 * The camera for the reel at solve time `t`, written into `out` as one
 * body → screen matrix (the cube's real grip, smoothed, then the standard
 * three-quarter camera). `settle` 0..1 eases the cube from whatever way it
 * was held to the resting pose, for the end card. A solve with a gyro
 * stream reads its smoothed track (no allocation); one without falls back
 * to the named regrips.
 */
export function reelViewInto(out: Float64Array, tl: ReelTimeline, t: number, settle = 0): void {
  if (tl.viewTrack) {
    trackQuatInto(tl.viewTrack, t, Q);
  } else {
    const view = viewAt(tl, t).view;
    if (settle <= 0) {
      for (let i = 0; i < 9; i++) GRIP[i] = view[i];
      compose(out, tl, t, 0);
      return;
    }
    const q = matToQuat(view);
    Q[0] = q.x;
    Q[1] = q.y;
    Q[2] = q.z;
    Q[3] = q.w;
  }
  if (settle > 0) blendQuatInto(Q, Q, HOME_Q, settle);
  quatToMatInto(GRIP, Q);
  compose(out, tl, t, settle);
}

/**
 * out = CAMERA · GRIP, with the camera swung a few degrees toward the face being turned: the standard
 * camera is Rx(26) · Ry(-34), and a lean of yaw y (toward the cube's right) and pitch p (up) makes it
 * Rx(26 + p) · Ry(-34 - y). The lean fades out as the end card settles, and is off under
 * reduced motion.
 */
function compose(out: Float64Array, tl: ReelTimeline, t: number, settle: number): void {
  let yaw = 0;
  let pitch = 0;
  if (settle < 1 && Number.isFinite(t) && cameraMotionAllowed()) {
    const lean = leanAt(leanTurnsFor(tl), t, GRIP);
    const k = (tl.viewTrack ? LEAN_SHARE_WITH_GYRO : LEAN_SHARE) * (1 - settle);
    yaw = lean.yaw * k;
    pitch = lean.pitch * k;
  }
  if (yaw === 0 && pitch === 0) {
    mul3(out, CAMERA, GRIP);
    return;
  }
  rotY(ROT, -yaw);
  mul3(SWING, CAMERA, ROT);
  rotX(ROT, pitch);
  mul3(SWUNG, ROT, SWING);
  mul3(out, SWUNG, GRIP);
}

/** out = a · b (3x3, row-major); `out` must not be `a` or `b`. */
function mul3(out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
}

/** Right-handed rotations about x and y, in degrees (the same convention as lib/gyro/orientation's axisRotation). */
function rotX(out: Float64Array, deg: number): void {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.set([1, 0, 0, 0, c, -s, 0, s, c]);
}

function rotY(out: Float64Array, deg: number): void {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.set([c, 0, s, 0, 1, 0, -s, 0, c]);
}
