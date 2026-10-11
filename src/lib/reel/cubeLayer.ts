import type { CubeScene } from "@/lib/cube3d/scene";
import type { CubeLook } from "@/lib/cube3d/look";
import { parseMove } from "@/lib/cube-engine/stickerTurns";
import { matToQuat, transpose, type Mat3 } from "@/lib/gyro/orientation";
import { CAMERA } from "./cube3d";

/**
 * The reel's photoreal cube: the same three.js scene the app draws, rendered into one offscreen WebGL canvas and
 * copied into the reel canvas with drawImage. The frame functions are synchronous, but three.js loads lazily, so
 * `preloadCubeLayer` is called when a reel page mounts; until it has resolved (or if WebGL is unavailable)
 * `drawCubeLayer` returns false and the caller draws the 2D software cube instead. Once ready, a frame is a pure
 * function of its arguments (no motion blur, which depends on frame timing), so a given t always looks the same.
 */

/** Pixel width of the offscreen render for the 1080-wide video (the cube is drawn about this large). */
export const CUBE_LAYER_PX = 760;
/** The scene places the cube above the middle of its canvas, with room under it for the shadow; the layer is drawn this much (in layer px) lower so the cube itself sits where the 2D cube did. */
const CUBE_LAYER_LIFT = 232;
/** The layer is drawn this much larger than `width` so the cube is as big as the 2D one was. */
export const CUBE_LAYER_SCALE = 0.84;

interface Layer {
  canvas: HTMLCanvasElement;
  scene: CubeScene;
}

let layer: Layer | null = null;
let loading: Promise<boolean> | null = null;

/** Load three.js and build the offscreen scene once. Resolves true when `drawCubeLayer` will work. */
export function preloadCubeLayer(): Promise<boolean> {
  if (layer) return Promise.resolve(true);
  if (typeof document === "undefined") return Promise.resolve(false);
  loading ??= (async () => {
    try {
      const { CubeScene } = await import("@/lib/cube3d/scene");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = CUBE_LAYER_PX;
      const scene = new CubeScene(canvas, { quality: "high", preserveDrawingBuffer: true, reflection: false });
      scene.resize(CUBE_LAYER_PX, CUBE_LAYER_PX, 1);
      layer = { canvas, scene };
      return true;
    } catch {
      return false;
    }
  })();
  return loading;
}

export function cubeLayerReady(): boolean {
  return layer !== null;
}

export interface CubeLayerFrame {
  /** the cube before `turning` */
  facelets: string;
  /** face turn token and its linear 0..1 progress (the scene eases it itself) */
  turning?: { token: string; progress: number } | null;
  /** the reel camera's body to screen matrix (see reelViewInto) */
  view: ArrayLike<number>;
  look?: CubeLook;
}

/** The scene has its own fixed camera, so the orientation it needs is the reel's view with the reel's standard camera taken off. */
const CAMERA_T: Mat3 = transpose(CAMERA);
const GRIP = new Float64Array(9);

/**
 * Draw the cube centred on (cx, cy) in the current (translated) context, `width` px wide.
 * Returns false when the 3D cube is not available, so the caller falls back to the 2D renderer.
 */
export function drawCubeLayer(ctx: CanvasRenderingContext2D, f: CubeLayerFrame, cx: number, cy: number, width: number): boolean {
  if (!layer) return false;
  try {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) GRIP[r * 3 + c] = CAMERA_T[r * 3] * f.view[c] + CAMERA_T[r * 3 + 1] * f.view[3 + c] + CAMERA_T[r * 3 + 2] * f.view[6 + c];
    const turn = f.turning ? parseMove(f.turning.token) : null;
    const state = {
      facelets: f.facelets,
      turning: turn && f.turning ? { turn, progress: f.turning.progress } : null,
      orientation: matToQuat(GRIP as unknown as Mat3),
      motionBlur: false,
      look: f.look,
    };
    layer.scene.render(state);
    const k = (width * CUBE_LAYER_SCALE) / CUBE_LAYER_PX;
    ctx.drawImage(layer.canvas, cx - (CUBE_LAYER_PX * k) / 2, cy - (CUBE_LAYER_PX * k) / 2 - CUBE_LAYER_LIFT * k, CUBE_LAYER_PX * k, CUBE_LAYER_PX * k);
    return true;
  } catch {
    return false;
  }
}
