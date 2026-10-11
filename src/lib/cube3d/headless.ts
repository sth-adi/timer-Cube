import type { CubeQuality, CubeScene, CubeSceneState } from "./scene";

export interface CubeFrameOptions extends CubeSceneState {
  /** CSS-pixel size of the square (or w x h) frame; defaults to the canvas's current size */
  size?: number;
  width?: number;
  height?: number;
  /** drawing-buffer scale (default 1: the canvas is sized in real pixels by the caller) */
  dpr?: number;
  quality?: CubeQuality;
}

const scenes = new WeakMap<HTMLCanvasElement, Promise<CubeScene>>();

/**
 * Draw one frame of the glossy 3D cube onto `canvas` (transparent background), for the reel's canvas video code.
 * The first call for a canvas loads three.js and builds the scene; later calls reuse it. The canvas keeps its
 * pixels after the call returns, so it can be passed to drawImage or captured straight away. Resolves false if
 * WebGL is unavailable (the caller should fall back to its own drawing).
 */
export async function renderCubeFrameToCanvas(canvas: HTMLCanvasElement, opts: CubeFrameOptions): Promise<boolean> {
  try {
    let p = scenes.get(canvas);
    if (!p) {
      p = import("./scene").then((m) => new m.CubeScene(canvas, { quality: opts.quality ?? "high", preserveDrawingBuffer: true }));
      scenes.set(canvas, p);
    }
    const scene = await p;
    const dpr = opts.dpr ?? 1;
    const w = opts.width ?? opts.size ?? canvas.width / dpr;
    const h = opts.height ?? opts.size ?? canvas.height / dpr;
    scene.resize(w, h, dpr);
    scene.render({ facelets: opts.facelets, turning: opts.turning, orientation: opts.orientation, motionBlur: opts.motionBlur ?? true, look: opts.look, jiggle: opts.jiggle, faceLetters: opts.faceLetters, stickerFills: opts.stickerFills, opacity: opts.opacity, nextMove: opts.nextMove, highlight: opts.highlight });
    return true;
  } catch {
    scenes.delete(canvas);
    return false;
  }
}

/** Free the GPU resources `renderCubeFrameToCanvas` built for this canvas. */
export async function disposeCubeFrameCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const p = scenes.get(canvas);
  scenes.delete(canvas);
  try {
    (await p)?.dispose();
  } catch {
    // never built
  }
}
