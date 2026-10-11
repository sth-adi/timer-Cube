/**
 * How far back the fixed camera sits so the cube fills its box. Instead of fitting the cube's bounding sphere (which leaves
 * a lot of air at rest) this projects the cube's real silhouette, over the turns and tilts it is shown in, and the contact
 * shadow, and takes the tightest distance at which none of it leaves the frame. Pure maths, no three.js.
 */

type V3 = [number, number, number];

export interface FitInput {
  /** width / height of the canvas */
  aspect: number;
  /** vertical field of view, degrees */
  fovDeg: number;
  /** where the camera sits around the cube, degrees (yaw to the right of the front, pitch above) */
  camYawDeg: number;
  camPitchDeg: number;
  /** the point the camera looks at (x = z = 0) */
  lookY: number;
  /** the floor the contact shadow lies on, and how far below it the frame must still reach */
  floorY: number;
  floorMargin: number;
  /** the largest lean about the horizontal axes the cube is shown at, degrees */
  tiltDeg: number;
  /** how far round the vertical axis the cube is shown at, degrees either side of its home grip (the cube's symmetry caps this at 45) */
  yawSpanDeg?: number;
  /** how much of a turning layer's corner sweep must stay in frame, 0..1 (1 never clips mid-turn, less lets a corner graze the edge for a moment) */
  sweep?: number;
  /** extra room, as a factor on the distance (1.03 is 3%) */
  margin?: number;
}

/** Half the cube's width including the stickers' lift. */
export const CUBE_HALF = 1.54;
const SHADOW_RADIUS = 1.6;

/** Points of the cube's silhouette: its corners and the corners of an outer layer a quarter of the way through a turn (45 degrees), on every axis. */
export function cubePoints(sweep = 1): V3[] {
  const h = CUBE_HALF;
  const SWEEP = CUBE_HALF * Math.SQRT2 * sweep;
  const out: V3[] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) out.push([x, y, z]);
  for (const a of [-h, h]) {
    for (const r of [SWEEP, -SWEEP]) {
      out.push([a, r, 0], [a, 0, r], [r, a, 0], [0, a, r], [r, 0, a], [0, r, a]);
    }
  }
  return out;
}

function rotate(p: V3, yaw: number, pitch: number, roll: number): V3 {
  let [x, y, z] = p;
  // roll about z, then pitch about x, then yaw about y
  [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  return [x, y, z];
}

export function fitDistance(i: FitInput): number {
  const rad = Math.PI / 180;
  const yawC = i.camYawDeg * rad;
  const pitchC = i.camPitchDeg * rad;
  const dir: V3 = [Math.sin(yawC) * Math.cos(pitchC), Math.sin(pitchC), Math.cos(yawC) * Math.cos(pitchC)];
  // camera basis: right = up x dir (normalised), up = dir x right
  const rx = dir[2];
  const rz = -dir[0];
  const rl = Math.hypot(rx, rz) || 1;
  const right: V3 = [rx / rl, 0, rz / rl];
  const up: V3 = [dir[1] * right[2] - dir[2] * right[1], dir[2] * right[0] - dir[0] * right[2], dir[0] * right[1] - dir[1] * right[0]];
  const ty = Math.tan((i.fovDeg * rad) / 2);
  const tx = ty * i.aspect;
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let need = 0;
  const take = (p: V3) => {
    const q: V3 = [p[0], p[1] - i.lookY, p[2]];
    const zc = dot(q, dir);
    need = Math.max(need, Math.abs(dot(q, right)) / tx + zc, Math.abs(dot(q, up)) / ty + zc);
  };
  const t = i.tiltDeg * rad;
  const pts = cubePoints(i.sweep ?? 1);
  const span = Math.min(45, i.yawSpanDeg ?? 45);
  // The cube is four-fold symmetric about the vertical axis, so a span of 45 degrees either side covers every grip.
  for (let yaw = -span; yaw <= span; yaw += Math.max(5, span / 3))
    for (const pitch of [-t, 0, t])
      for (const roll of [-t, 0, t]) for (const p of pts) take(rotate(p, yaw * rad, pitch, roll));
  for (let a = 0; a < 8; a++) take([Math.cos((a * Math.PI) / 4) * SHADOW_RADIUS, i.floorY, Math.sin((a * Math.PI) / 4) * SHADOW_RADIUS]);
  take([0, i.floorY - i.floorMargin, 0]);
  return need * (i.margin ?? 1.03);
}
