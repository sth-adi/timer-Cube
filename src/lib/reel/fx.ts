import { REEL_H, REEL_W, clamp01, easeOut } from "./draw";
import { withAlpha } from "./theme";

/**
 * Stateless canvas effects for the Solve Reel: every one is a pure function
 * of how long ago it started, so a frame never depends on the one before
 * (the exporter scrubs frames in any order). Nothing is allocated per frame
 * except the odd gradient, cached per canvas.
 */

/** An expanding shockwave ring centred on (cx, cy): `k` runs 0..1 over its life. */
export function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number, color: string, maxR = 460, width = 14): void {
  if (k <= 0 || k >= 1) return;
  const e = easeOut(k);
  ctx.save();
  ctx.globalAlpha = 0.6 * (1 - k) * (1 - k);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * (1 - 0.6 * e);
  ctx.beginPath();
  ctx.arc(cx, cy, 90 + maxR * e, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A full-canvas flash (canvas space, whatever transform is in force): `k` 0..1 over its life, `peak` the opening alpha. */
export function drawFlash(ctx: CanvasRenderingContext2D, k: number, peak: number, color = "#ffffff"): void {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = peak * (1 - k) * (1 - k);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  ctx.restore();
}

const glows = new WeakMap<object, Map<string, CanvasGradient>>();

/**
 * A soft radial glow of `color` behind the cube, drawn in canvas space (`cx`, `cy` are canvas px).
 * The phase hue washes through the background this way, so the whole card changes mood with the solve.
 */
export function drawPhaseGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  let byColor = glows.get(ctx);
  if (!byColor) glows.set(ctx, (byColor = new Map()));
  const key = `${color}|${cx}|${cy}`;
  let g = byColor.get(key);
  if (!g) {
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760);
    g.addColorStop(0, withAlpha(color, 0.5));
    g.addColorStop(0.5, withAlpha(color, 0.16));
    g.addColorStop(1, withAlpha(color, 0));
    byColor.set(key, g);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  ctx.restore();
}

/** Deterministic noise in [0, 1): the same piece of confetti lands in the same place in every render. */
function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const CONFETTI = ["#ef4444", "#f59e0b", "#fde047", "#22c55e", "#3b82f6", "#ffffff"];
const CONFETTI_COUNT = 72;
const CONFETTI_MS = 2100;

/** A burst of confetti from (cx, cy), `dt` ms after it was fired. Ballistic: launch velocity, then gravity. */
export function drawConfetti(ctx: CanvasRenderingContext2D, cx: number, cy: number, dt: number): void {
  if (dt < 0 || dt > CONFETTI_MS) return;
  const s = dt / 1000;
  const fade = 1 - clamp01((dt - CONFETTI_MS * 0.65) / (CONFETTI_MS * 0.35));
  ctx.save();
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const ang = -Math.PI / 2 + (rnd(i, 1) - 0.5) * Math.PI * 1.25;
    const speed = 520 + rnd(i, 2) * 820;
    const x = cx + Math.cos(ang) * speed * s * (1 - 0.25 * s);
    const y = cy + Math.sin(ang) * speed * s + 0.5 * 1500 * s * s;
    const spin = (rnd(i, 3) - 0.5) * 16 * s;
    const w = 14 + rnd(i, 4) * 14;
    ctx.globalAlpha = fade;
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    // Tumbling in 3D: the piece's height breathes between thin and full.
    ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(spin * 1.7 + i)));
    ctx.fillRect(-w / 2, -w / 4, w, w / 2);
    ctx.restore();
  }
  ctx.restore();
}
