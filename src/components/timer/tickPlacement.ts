/**
 * Where the "face just turned" tick belongs on the live cube's box, worked out from the camera the cube
 * is actually drawn in rather than assumed. Notation is fixed to the cube (U is the face whose centre is
 * white), but the live view holds it yellow-up, green-front, so the white face is at the BOTTOM and the
 * orange face on the right. A table written for a white-up view puts the U tick on the wrong edge.
 */

/** The live cube's camera (LiveCubeMimic), as CSS degrees: the tilt, then the half turn that puts yellow on top. */
export interface Camera {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
}
export const LIVE_CAMERA: Camera = { rotateX: -24, rotateY: 32, rotateZ: 180 };

export type FaceName = "U" | "D" | "L" | "R" | "F" | "B";
export type TickEdge = "top" | "bottom" | "left" | "right" | "front" | "back";

/** CSS 3D coordinates: x right, y down, z toward the viewer. */
const NORMALS: Record<FaceName, readonly [number, number, number]> = {
  U: [0, -1, 0],
  D: [0, 1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Where a face's centre lands on screen under `transform: rotateX() rotateY() rotateZ()` (Z applied first, as CSS does). */
export function faceOnScreen(face: FaceName, cam: Camera = LIVE_CAMERA): { x: number; y: number; z: number } {
  let [x, y, z] = NORMALS[face];
  const cz = Math.cos(rad(cam.rotateZ));
  const sz = Math.sin(rad(cam.rotateZ));
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const cy = Math.cos(rad(cam.rotateY));
  const sy = Math.sin(rad(cam.rotateY));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const cx = Math.cos(rad(cam.rotateX));
  const sx = Math.sin(rad(cam.rotateX));
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return { x, y, z };
}

/**
 * Which edge of the box a face's tick sits on: the side of the picture that face is on. The face looking
 * at the viewer is "front" (no edge of its own, so it takes a corner), the one looking away "back".
 */
export function tickEdge(face: FaceName, cam: Camera = LIVE_CAMERA): TickEdge {
  const { x, y, z } = faceOnScreen(face, cam);
  if (Math.abs(z) > Math.max(Math.abs(x), Math.abs(y))) return z > 0 ? "front" : "back";
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? "left" : "right") : y < 0 ? "top" : "bottom";
}

/** Tailwind positions for the tick on each edge. F and B have no edge in a three-quarter view, so they take a bottom-left and a top-right corner. */
const EDGE_CLASS: Record<TickEdge, string> = {
  top: "left-1/4 right-1/4 top-0 h-[3px]",
  bottom: "left-1/4 right-1/4 bottom-0 h-[3px]",
  left: "left-0 top-1/4 bottom-1/4 w-[3px]",
  right: "right-0 top-1/4 bottom-1/4 w-[3px]",
  front: "bottom-0 left-0 h-[3px] w-1/5",
  back: "right-0 top-0 h-[3px] w-1/5",
};

/** The position classes for `face`'s tick in the live camera, or null for anything that is not a face (a slice, a rotation). */
export function tickPositionClass(face: string): string | null {
  return face in NORMALS ? EDGE_CLASS[tickEdge(face as FaceName)] : null;
}
