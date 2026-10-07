/**
 * Where the cube's contact shadow goes for a given tilt, worked out from the cube's own CSS transform so the
 * shadow follows whatever the caller does to it (the gyro, a replay's lean) without that caller knowing.
 *
 * The transform a twin is given is a camera (leading rotateX/rotateY) followed by the cube's own grip. Only the
 * grip tilts the cube against the floor, so that is the part used: the cube's eight corners and six face
 * centres are turned by it, and the shadow is read off the result. The floor is the horizontal plane (x across,
 * z toward the viewer, y down). The footprint widens and deepens as the cube turns corner-first, and the shadow
 * leans toward whichever face is lowest, so a cube tipped on an edge casts to that side. Everything is a plain
 * offset and scale of a flat ellipse; there is no blur.
 */

export interface GroundShadow {
  /** Pixels to move the ellipse sideways. */
  dx: number;
  /** Pixels to move it toward the viewer (down the screen). */
  dy: number;
  /** Stretch across (1 for an upright, face-on cube). */
  sx: number;
  /** Stretch in depth. */
  sy: number;
}

export const NO_SHADOW_SHIFT: GroundShadow = { dx: 0, dy: 0, sx: 1, sy: 1 };

/** How strongly the footprint's growth shows (1 would be the full geometric growth of a corner-first cube). */
const GROW = 0.6;
/** How much of the lowest face's sideways / forward lean the shadow takes, in cube sizes. */
const LEAN_X = 0.5;
const LEAN_Y = 0.18;
/** The limits, so a wild pose can never throw the shadow across the stage. */
const MAX_SCALE = 1.4;

const SIGNS = [-1, 1] as const;

/**
 * `m` is a CSS 4x4 matrix, column-major as DOMMatrix.toFloat32Array() gives it (the cube's grip, no camera).
 * `size` is the cube's side in px.
 */
export function shadowFromMatrix(m: ArrayLike<number>, size: number): GroundShadow {
  const h = size / 2;
  const at = (x: number, y: number, z: number): [number, number, number] => [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const x of SIGNS)
    for (const y of SIGNS)
      for (const z of SIGNS) {
        const [px, , pz] = at(x * h, y * h, z * h);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minZ = Math.min(minZ, pz);
        maxZ = Math.max(maxZ, pz);
      }
  // The face lying lowest (largest y, y being down).
  let lowest: [number, number, number] = [0, -Infinity, 0];
  for (const axis of [0, 1, 2]) {
    for (const sign of SIGNS) {
      const v: [number, number, number] = [0, 0, 0];
      v[axis] = sign * h;
      const p = at(v[0], v[1], v[2]);
      if (p[1] > lowest[1]) lowest = p;
    }
  }
  const clamp = (v: number) => Math.max(1 / MAX_SCALE, Math.min(MAX_SCALE, v));
  const grow = (extent: number) => clamp(1 + GROW * (extent / size - 1));
  const lean = (v: number, k: number) => (Number.isFinite(v) ? v * k : 0);
  return { dx: lean(lowest[0], LEAN_X), dy: lean(lowest[2], LEAN_Y), sx: grow(maxX - minX), sy: grow(maxZ - minZ) };
}

/** The camera and the grip of a twin's transform string: leading rotateX/rotateY calls are the camera, the rest the grip. */
export function splitCamera(transform: string): { camera: string; grip: string } {
  const m = /^\s*((?:rotate[XY]\([^)]*\)\s*)*)/.exec(transform);
  const camera = m ? m[1] : "";
  return { camera, grip: transform.slice(camera.length).trim() };
}

/** The CSS transform for the shadow ellipse given the cube element's transform; the plain, unshifted one when it can't be read. */
export function shadowTransform(cubeTransform: string, size: number): string {
  let g = NO_SHADOW_SHIFT;
  try {
    const { grip } = splitCamera(cubeTransform);
    if (grip && typeof DOMMatrixReadOnly !== "undefined") g = shadowFromMatrix(new DOMMatrixReadOnly(grip).toFloat32Array(), size);
  } catch {
    // An unreadable transform (or no DOMMatrix, as in a test environment) just leaves the shadow where it sits.
  }
  return `translate(${g.dx.toFixed(1)}px, ${g.dy.toFixed(1)}px) scale(${g.sx.toFixed(3)}, ${g.sy.toFixed(3)})`;
}
