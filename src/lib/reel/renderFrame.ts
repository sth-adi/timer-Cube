import { mul } from "@/lib/gyro/orientation";
import { CAMERA, drawCube } from "./cube3d";
import { frameAt, rollingTps, viewAt, type ReelTimeline } from "./timeline";

/** Reel canvas size: 4:5 portrait, the shape social feeds display largest. */
export const REEL_W = 1080;
export const REEL_H = 1350;
/** Scrambled cube shown before the clock starts, and the solved card held after it stops. */
export const INTRO_MS = 1400;
export const OUTRO_MS = 2800;

export interface ReelStyle {
  accent: string;
  title: string;
  subtitle: string;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "system-ui, -apple-system, Segoe UI, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Truncated to hundredths, like every other time in the app (a 10.709 is a 10.70, not a 10.71). */
function fmt(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const s = cs / 100;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2);
}

/**
 * Draws one frame of a Solve Reel at `t` ms relative to the solve's start
 * (negative = the intro, beyond the total = the outro card).
 */
export function renderReelFrame(ctx: CanvasRenderingContext2D, tl: ReelTimeline, t: number, style: ReelStyle): void {
  const W = REEL_W;
  const H = REEL_H;

  // Background: deep gradient + an accent glow behind the cube.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0c0a17");
  bg.addColorStop(1, "#16112b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 610, 40, W / 2, 610, 500);
  glow.addColorStop(0, `${style.accent}55`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const clampT = Math.min(Math.max(t, 0), tl.totalMs);
  const atT = t < 0 ? -Infinity : clampT;
  const frame = frameAt(tl, atT);
  const finished = t >= tl.totalMs;
  // The camera itself: HOME_ORIENTATION composed with every regrip the cuber
  // actually did, mid-swing when we're within one — the reel doesn't just
  // watch the layers turn, it watches the cube get physically turned around
  // in your hands too. See lib/gyro/orientation for why this composes the
  // way it does.
  const { view } = viewAt(tl, atT);

  // Header
  ctx.fillStyle = "#ffffffaa";
  ctx.font = `600 30px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillText(style.title.toUpperCase(), 70, 90);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff66";
  ctx.fillText(style.subtitle, W - 70, 90);

  // Timer
  ctx.textAlign = "center";
  ctx.fillStyle = finished ? style.accent : "#ffffff";
  ctx.font = `800 160px ${MONO}`;
  ctx.fillText(fmt(clampT), W / 2, 275);

  // Cube (turning layer animated)
  const faceletState = tl.facelets[frame.done];
  const turning =
    frame.turning && t >= 0 && !finished ? { token: tl.moves[frame.turning.index], progress: Math.min(1, frame.turning.progress) } : undefined;
  drawCube(ctx, faceletState, { cx: W / 2, cy: 610, size: 205, view: mul(CAMERA, view), turning });

  // Phase banner
  const phaseLabel =
    t < 0 ? "Scrambled — inspection" : finished ? "Solved" : (tl.phases[frame.phaseIndex]?.label ?? "Solving");
  ctx.font = `700 44px ${SANS}`;
  const bw = Math.min(W - 140, ctx.measureText(phaseLabel).width + 90);
  roundRect(ctx, W / 2 - bw / 2, 950, bw, 84, 42);
  ctx.fillStyle = finished ? style.accent : "#ffffff18";
  ctx.fill();
  ctx.fillStyle = finished ? "#0c0a17" : "#ffffff";
  ctx.fillText(phaseLabel, W / 2, 1007);

  // Splits so far
  const doneSplits = tl.phases.filter((p) => p.endMs <= clampT || finished);
  ctx.font = `600 26px ${SANS}`;
  let x = 70;
  let y = 1090;
  ctx.textAlign = "left";
  for (const p of doneSplits) {
    const label = `${p.label.replace(/^OLL · |^PLL · /, "")} ${fmt(p.splitMs)}`;
    const w = ctx.measureText(label).width + 36;
    if (x + w > W - 70) {
      x = 70;
      y += 52;
    }
    roundRect(ctx, x, y - 32, w, 44, 22);
    ctx.fillStyle = "#ffffff12";
    ctx.fill();
    ctx.fillStyle = "#ffffffcc";
    ctx.fillText(label, x + 18, y);
    x += w + 10;
  }

  // Move ticker (outro: summary instead)
  ctx.textAlign = "center";
  if (finished) {
    const tps = tl.moves.length / Math.max(0.001, tl.totalMs / 1000);
    ctx.fillStyle = "#ffffffcc";
    ctx.font = `600 38px ${SANS}`;
    ctx.fillText(`${tl.moves.length} moves · ${tps.toFixed(2)} TPS`, W / 2, 1265);
  } else if (t < 0) {
    ctx.fillStyle = "#ffffff99";
    ctx.font = `500 26px ${MONO}`;
    wrapText(ctx, tl.scramble, W / 2, 1230, W - 160, 36);
  } else {
    // Everything that's happened by now — a turn or a regrip — narrated in
    // one stream; a regrip still mid-swing counts too (its atMs is when it
    // *started*), same as a move still mid-turn does below.
    let shown = tl.ticker.filter((e) => e.atMs <= clampT);
    if (frame.turning) shown = [...shown, { token: tl.display[frame.turning.index], atMs: tl.timesMs[frame.turning.index], rotation: false }];
    shown = shown.slice(-9);
    ctx.font = `700 46px ${MONO}`;
    const gap = 104;
    const startX = W / 2 - ((shown.length - 1) * gap) / 2;
    shown.forEach((e, i) => {
      const current = i === shown.length - 1;
      ctx.fillStyle = current ? style.accent : i < shown.length - 3 ? "#ffffff44" : "#ffffffaa";
      ctx.fillText(e.rotation ? `[${e.token}]` : e.token, startX + i * gap, 1250);
    });
    // Rolling TPS bar
    const tps = rollingTps(tl, clampT);
    const barW = W - 140;
    roundRect(ctx, 70, 1290, barW, 14, 7);
    ctx.fillStyle = "#ffffff14";
    ctx.fill();
    roundRect(ctx, 70, 1290, Math.max(14, (Math.min(tps, 15) / 15) * barW), 14, 7);
    ctx.fillStyle = style.accent;
    ctx.fill();
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = "#ffffff88";
    ctx.textAlign = "right";
    ctx.fillText(`${tps} TPS`, W - 70, 1280);
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}
