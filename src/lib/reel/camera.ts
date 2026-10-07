import { HOME_ORIENTATION, matToQuat } from "@/lib/gyro/orientation";
import { CAMERA } from "./cube3d";
import { viewAt, type ReelTimeline } from "./timeline";
import { blendQuatInto, quatToMatInto, trackQuatInto } from "./viewTrack";

const Q = new Float64Array(4);
const GRIP = new Float64Array(9);
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
      compose(out);
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
  compose(out);
}

/** out = CAMERA · GRIP */
function compose(out: Float64Array): void {
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) out[r * 3 + c] = CAMERA[r * 3] * GRIP[c] + CAMERA[r * 3 + 1] * GRIP[3 + c] + CAMERA[r * 3 + 2] * GRIP[6 + c];
}
