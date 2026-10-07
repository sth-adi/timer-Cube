import { reelViewInto } from "./camera";
import { drawCube, drawGroundShadow } from "./cube3d";
import {
  PHASE_HUES,
  REEL_H,
  REEL_W,
  SAFE_X,
  clamp01,
  drawBackdrop,
  easeInOut,
  easeOut,
  easeOutBack,
  fmtTime,
  fontsFor,
  roundRectPath,
  setSpacing,
  textWidth,
} from "./draw";
import { layoutPacing, pacingIndexAt, pacingSegments, playheadX, type PacingSegment, type PacingSlot } from "./pacing";
import { frameAt, tickerCountAt, type ReelTimeline } from "./timeline";
import { withAlpha } from "./theme";

export { REEL_H, REEL_W };
/** Scrambled cube shown before the clock starts, and the solved card held after it stops. */
export const INTRO_MS = 1400;
export const OUTRO_MS = 2800;

export interface ReelStyle {
  accent: string;
  title: string;
  subtitle: string;
  /** Small watermark at the foot of the card (a username, or the app's name). */
  credit?: string;
  /** The app's own font stacks, when known (see readReelTheme). */
  sans?: string;
  mono?: string;
}

// ───────────────────────────── layout (canvas px) ─────────────────────────────
const CX = REEL_W / 2;
const HEADER_Y = 204;
const HERO_Y = 396;
const CHIP_Y = 478;
const CUBE_CY = 756;
const CUBE_SIZE = 156;
/** Where the soft ground shadow sits: under the lowest the cube's silhouette normally reaches. */
const SHADOW_Y = CUBE_CY + 246;
const TICKER_Y = 1066;
const SCRAMBLE_Y = 1046;
const BAR_X = SAFE_X;
const BAR_W = REEL_W - SAFE_X * 2;
const BAR_Y = 1120;
const BAR_H = 16;
const SEG_GAP = 8;
const SEG_MIN_W = 118;
const LABEL_Y = 1170;
const SPLIT_Y = 1202;
const CREDIT_Y = 1272;
/** Turn easing is the same gentle in-out the Gyro Twin uses. */
const TICKER_SLOTS = 3;
const TICKER_GAP = 124;

interface Bar {
  segs: PacingSegment[];
  slots: PacingSlot[];
}
const bars = new WeakMap<ReelTimeline, Bar>();
/** The pacing bar's geometry for a timeline — worked out once, not per frame. */
function barFor(tl: ReelTimeline): Bar {
  let b = bars.get(tl);
  if (!b) {
    const segs = pacingSegments(tl.phases, tl.totalMs);
    b = { segs, slots: layoutPacing(segs, BAR_W, SEG_GAP, SEG_MIN_W) };
    bars.set(tl, b);
  }
  return b;
}

const scrambles = new WeakMap<ReelTimeline, string[]>();
function scrambleLines(ctx: CanvasRenderingContext2D, tl: ReelTimeline, maxW: number): string[] {
  let lines = scrambles.get(tl);
  if (!lines) {
    lines = [];
    let line = "";
    for (const w of tl.scramble.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${w}` : w;
      if (line && textWidth(ctx, test) > maxW) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > 2) lines = [lines[0], `${lines[1]} …`];
    scrambles.set(tl, lines);
  }
  return lines;
}

const VIEW = new Float64Array(9);

/**
 * Draws one frame of a Solve Reel at `t` ms relative to the solve's start
 * (negative = the intro, beyond the total = the outro card).
 *
 * Everything that must be read lives inside the 1:1 safe square (see
 * draw.ts); only the watermark sits outside it. The frame is a pure
 * function of `t`: no state is kept between frames, and nothing but
 * strings is built per frame.
 */
export function renderReelFrame(ctx: CanvasRenderingContext2D, tl: ReelTimeline, t: number, style: ReelStyle): void {
  const F = fontsFor(style.sans, style.mono);
  const { accent } = style;
  const { segs, slots } = barFor(tl);

  const finished = t >= tl.totalMs;
  const clampT = Math.min(Math.max(t, 0), tl.totalMs);
  const atT = t < 0 ? -Infinity : clampT;
  const frame = frameAt(tl, atT);
  // 0 → 1 over the first half second of the intro (a fade up from the dark), and over the first stretch of the end card.
  const introK = easeOut((t + INTRO_MS) / 650);
  const outroK = finished ? clamp01((t - tl.totalMs) / 700) : 0;
  const bump = finished ? easeOutBack((t - tl.totalMs) / 520) : 0;
  const phaseIdx = pacingIndexAt(segs, clampT);
  const hue = t < 0 || finished ? accent : PHASE_HUES[segs[phaseIdx].hue];

  ctx.textBaseline = "alphabetic";
  drawBackdrop(ctx, accent, CUBE_CY, finished ? 1 : 0);

  // ── Header: title at the left, date (or position in the montage) at the right.
  ctx.globalAlpha = introK;
  roundRectPath(ctx, SAFE_X, HEADER_Y - 20, 20, 20, 6);
  ctx.fillStyle = accent;
  ctx.fill();
  setSpacing(ctx, 3);
  ctx.textAlign = "left";
  ctx.font = F.header;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(style.title.toUpperCase(), SAFE_X + 36, HEADER_Y);
  setSpacing(ctx, 0);
  ctx.textAlign = "right";
  ctx.font = F.headerSub;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(style.subtitle, REEL_W - SAFE_X, HEADER_Y);

  // ── Hero: the time. White while it runs, accent once it has stopped.
  ctx.textAlign = "center";
  ctx.font = F.hero;
  const text = fmtTime(clampT);
  const scale = 1 + 0.05 * bump;
  ctx.save();
  ctx.translate(CX, HERO_Y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = introK * (t < 0 ? 0.4 : 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 0, 0);
  if (outroK > 0) {
    ctx.globalAlpha = outroK;
    ctx.fillStyle = accent;
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();

  // ── Chip row: which phase we're in (or Scramble / Solved) and the pace so far.
  ctx.globalAlpha = introK;
  const moves = tl.moves.length;
  const elapsedS = Math.max(0.001, clampT / 1000);
  const label = t < 0 ? "Scramble" : finished ? "Solved" : (tl.phases[frame.phaseIndex]?.label ?? "Solving");
  const right = t < 0 ? "" : finished ? `${moves} moves · ${(moves / elapsedS).toFixed(2)} TPS` : clampT > 600 ? `${(frame.done / elapsedS).toFixed(1)} TPS` : "";
  ctx.font = F.chip;
  const lw = textWidth(ctx, label);
  ctx.font = F.small;
  const rw = right ? textWidth(ctx, right) : 0;
  const total = 26 + lw + (right ? 34 + rw : 0);
  let x = CX - total / 2;
  ctx.beginPath();
  ctx.arc(x + 7, CHIP_Y - 11, 7, 0, Math.PI * 2);
  ctx.fillStyle = hue;
  ctx.fill();
  x += 26;
  ctx.textAlign = "left";
  ctx.font = F.chip;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillText(label, x, CHIP_Y);
  if (right) {
    ctx.font = F.small;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(right, x + lw + 34, CHIP_Y);
  }

  // ── The cube, on its soft ground shadow. A layer mid-turn eases in and out.
  const lift = finished ? 1 + 0.03 * bump : 0.94 + 0.06 * introK;
  ctx.globalAlpha = introK;
  drawGroundShadow(ctx, CX, SHADOW_Y, 216 * lift, 0.95);
  reelViewInto(VIEW, tl, atT, easeInOut(outroK));
  const turning =
    frame.turning && t >= 0 && !finished
      ? { token: tl.moves[frame.turning.index], progress: easeInOut(Math.min(1, frame.turning.progress)) }
      : undefined;
  drawCube(ctx, tl.facelets[frame.done], { cx: CX, cy: CUBE_CY, size: CUBE_SIZE * lift, view: VIEW, turning });

  // ── Under the cube: the scramble (before and after), or the move ticker while it solves.
  ctx.globalAlpha = introK;
  ctx.textAlign = "center";
  if (t < 0 || finished) {
    ctx.font = F.scramble;
    ctx.fillStyle = finished ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.72)";
    const lines = scrambleLines(ctx, tl, REEL_W - SAFE_X * 2);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], CX, SCRAMBLE_Y + i * 34);
  } else {
    drawTicker(ctx, tl, clampT, frame.turning !== null, accent, F.tick, F.tickCurrent);
  }

  // ── Pacing bar: phase colours, a playhead, and each split popping in as its phase finishes.
  drawPacing(ctx, segs, slots, clampT, t < 0, finished, F.label, F.split, outroK);

  // ── Watermark, outside the square-crop safe area.
  if (style.credit) {
    ctx.globalAlpha = introK;
    ctx.textAlign = "center";
    ctx.font = F.credit;
    setSpacing(ctx, 1.5);
    ctx.fillStyle = "rgba(255,255,255,0.34)";
    ctx.fillText(style.credit, CX, CREDIT_Y);
    setSpacing(ctx, 0);
  }
  ctx.globalAlpha = 1;
}

/** Seven fixed slots: what just happened fading off to the left, the current turn lit in the middle, what's coming dim on the right. */
function drawTicker(ctx: CanvasRenderingContext2D, tl: ReelTimeline, t: number, midTurn: boolean, accent: string, font: string, fontCurrent: string): void {
  const count = tickerCountAt(tl, t);
  // A move still turning counts as the current one, same as a move that has just landed.
  const cur = midTurn && tl.ticker[count] && !tl.ticker[count].rotation ? count : count - 1;
  ctx.textAlign = "center";
  for (let j = -TICKER_SLOTS; j <= TICKER_SLOTS; j++) {
    const e = tl.ticker[cur + j];
    if (!e) continue;
    const d = Math.abs(j);
    const x = CX + j * TICKER_GAP;
    if (j === 0) {
      ctx.font = fontCurrent;
      ctx.fillStyle = accent;
    } else {
      ctx.font = font;
      ctx.fillStyle = j < 0 ? `rgba(255,255,255,${(0.82 - d * 0.2).toFixed(2)})` : `rgba(255,255,255,${(0.36 - d * 0.08).toFixed(2)})`;
    }
    ctx.fillText(e.rotation ? `[${e.token}]` : e.token, x, TICKER_Y);
  }
}

function drawPacing(
  ctx: CanvasRenderingContext2D,
  segs: readonly PacingSegment[],
  slots: readonly PacingSlot[],
  t: number,
  intro: boolean,
  finished: boolean,
  labelFont: string,
  splitFont: string,
  outroK: number,
): void {
  const active = intro ? -1 : pacingIndexAt(segs, t);
  ctx.textAlign = "center";
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    const s = slots[i];
    const x = BAR_X + s.x;
    const hue = PHASE_HUES[g.hue];
    const done = finished || (!intro && t >= g.endMs);
    // The track, then the part of it the clock has reached.
    roundRectPath(ctx, x, BAR_Y, s.w, BAR_H, BAR_H / 2);
    ctx.fillStyle = withAlpha(hue, 0.22);
    ctx.fill();
    const f = intro ? 0 : done ? 1 : clamp01((t - g.startMs) / Math.max(1, g.endMs - g.startMs));
    if (f > 0) {
      roundRectPath(ctx, x, BAR_Y, Math.max(BAR_H, s.w * f), BAR_H, BAR_H / 2);
      ctx.fillStyle = hue;
      ctx.fill();
    }
    // A notch where each F2L pair landed.
    if (g.ticks.length) {
      ctx.fillStyle = "rgba(12,10,23,0.7)";
      for (const tk of g.ticks) {
        const tx = x + s.w * ((tk - g.startMs) / Math.max(1, g.endMs - g.startMs));
        ctx.fillRect(tx - 1.5, BAR_Y + 3, 3, BAR_H - 6);
      }
    }
    // Name under the bar: lit for the stretch being solved, soft for the ones behind and ahead.
    ctx.font = labelFont;
    setSpacing(ctx, 1.6);
    const name = g.detail && g.detail !== "skip" ? `${g.label} · ${g.detail}` : g.detail === "skip" ? `${g.label} skip` : g.label;
    const fit = textWidth(ctx, name.toUpperCase()) <= s.w + SEG_GAP - 6 && (done || i === active) ? name : g.label;
    ctx.fillStyle = i === active && !finished ? "rgba(255,255,255,0.96)" : done ? "rgba(255,255,255,0.66)" : "rgba(255,255,255,0.36)";
    ctx.fillText(fit.toUpperCase(), x + s.w / 2, LABEL_Y);
    setSpacing(ctx, 0);
    // The split, popped in once its phase has ended.
    if (done) {
      const p = finished ? 1 : clamp01((t - g.endMs) / 300);
      const pop = easeOutBack(p);
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = prevAlpha * clamp01(p * 1.6);
      ctx.font = splitFont;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(fmtTime(g.endMs - g.startMs), x + s.w / 2, SPLIT_Y + (1 - pop) * 14);
      ctx.globalAlpha = prevAlpha;
    }
  }
  // The playhead: a short bright pill, with a soft halo, riding the bar.
  const hx = BAR_X + playheadX(segs, slots, intro ? 0 : t);
  const fade = 1 - outroK;
  if (fade > 0) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * fade * 0.22;
    roundRectPath(ctx, hx - 9, BAR_Y - 14, 18, BAR_H + 28, 9);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.globalAlpha = prevAlpha * fade;
    roundRectPath(ctx, hx - 3, BAR_Y - 11, 6, BAR_H + 22, 3);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }
}
