import { REEL_H, REEL_W, renderReelDesign } from "./renderFrame";
import { CARD_MS, OPENER_MS, montageAt, type HighlightKind, type Montage } from "./highlights";
import { LAYOUT_DY, LAYOUT_H, SAFE_X, drawBackdrop, easeOut, fmtTime, fontsFor, roundRectPath, setSpacing } from "./draw";
import { withAlpha } from "./theme";

export interface HighlightStyle {
  accent: string;
  title: string;
  subtitle: string;
  /** Small watermark at the foot of every card. */
  credit?: string;
  sans?: string;
  mono?: string;
}

const KIND_ICON: Record<HighlightKind, string> = { pb: "★", fastest: "⚡", tps: "✋", efficient: "◆" };

const fmt = fmtTime;

function background(ctx: CanvasRenderingContext2D, accent: string, pulse = 0) {
  drawBackdrop(ctx, accent, LAYOUT_H / 2, pulse);
}

/** Fade from/to black over `ms` at either end of a span of length `len`, at local time `t`. */
function fade(ctx: CanvasRenderingContext2D, t: number, len: number, ms = 220) {
  const a = t < ms ? 1 - t / ms : t > len - ms ? (t - (len - ms)) / ms : 0;
  if (a <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  ctx.restore();
}

/** Largest size (down from `px`) at which `text` still fits `maxW`, as a ready font string. */
function fitFont(ctx: CanvasRenderingContext2D, weight: number, px: number, family: string, text: string, maxW: number): string {
  ctx.font = `${weight} ${px}px ${family}`;
  const w = ctx.measureText(text).width;
  return w <= maxW ? ctx.font : `${weight} ${Math.floor((px * maxW) / w)}px ${family}`;
}

/** The faint watermark at the foot of a card — outside the 1:1 safe square, like the Solve Reel's. */
function credit(ctx: CanvasRenderingContext2D, style: HighlightStyle, F: ReturnType<typeof fontsFor>) {
  if (!style.credit) return;
  ctx.textAlign = "center";
  ctx.font = F.credit;
  setSpacing(ctx, 1.5);
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.fillText(style.credit, REEL_W / 2, 1422);
  setSpacing(ctx, 0);
}

/**
 * One frame of a Highlight Reel at montage time `t`: the opener, a caption
 * card, a solve playing (the regular Solve Reel frame, captioned), or the
 * finale — with a quick fade at every cut. Same type, margins and safe
 * area as the Solve Reel, so the cuts between them read as one video.
 */
export function renderHighlightFrame(ctx: CanvasRenderingContext2D, m: Montage, t: number, style: HighlightStyle): void {
  ctx.save();
  ctx.translate(0, LAYOUT_DY);
  renderHighlightDesign(ctx, m, t, style);
  ctx.restore();
}

function renderHighlightDesign(ctx: CanvasRenderingContext2D, m: Montage, t: number, style: HighlightStyle): void {
  const at = montageAt(m, t);
  const W = REEL_W;
  const H = LAYOUT_H;
  const n = m.segments.length;
  const F = fontsFor(style.sans, style.mono);
  const sans = style.sans ?? "system-ui, sans-serif";
  const mono = style.mono ?? "ui-monospace, monospace";
  const maxW = W - SAFE_X * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  if (at.kind === "opener") {
    background(ctx, style.accent, easeOut(at.t / 800));
    const k = easeOut(at.t / 700);
    ctx.globalAlpha = k;
    setSpacing(ctx, 5);
    ctx.fillStyle = "rgba(255,255,255,0.58)";
    ctx.font = F.caption;
    ctx.fillText(style.subtitle.toUpperCase(), W / 2, H / 2 - 150 + (1 - k) * 16);
    setSpacing(ctx, 0);
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, 800, Math.round(124 + 14 * k), sans, style.title, maxW);
    ctx.fillText(style.title, W / 2, H / 2 - 20);
    let best = Infinity;
    for (const s of m.segments) best = Math.min(best, s.highlight.finalMs);
    ctx.fillStyle = style.accent;
    ctx.font = F.body;
    ctx.fillText(`${n} solve${n === 1 ? "" : "s"} · best ${fmt(best)}`, W / 2, H / 2 + 70);
    credit(ctx, style, F);
    ctx.globalAlpha = 1;
    fade(ctx, at.t, OPENER_MS);
    return;
  }

  if (at.kind === "card") {
    const h = m.segments[at.index].highlight;
    background(ctx, style.accent, 1);
    const k = easeOut(at.t / 450);
    ctx.globalAlpha = k;
    setSpacing(ctx, 4);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = F.caption;
    ctx.fillText(`${at.index + 1} / ${n}`, W / 2, H / 2 - 250);
    setSpacing(ctx, 0);
    // The kind's mark in a soft accent disc.
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 - 160, 58, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(style.accent, 0.16);
    ctx.fill();
    ctx.fillStyle = style.accent;
    ctx.font = `700 64px ${sans}`;
    ctx.fillText(KIND_ICON[h.kind], W / 2, H / 2 - 138);
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, 800, 88, sans, h.caption, maxW);
    ctx.fillText(h.caption, W / 2 + (1 - k) * 60, H / 2 - 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, 700, 156, mono, fmt(h.finalMs), maxW);
    ctx.fillText(fmt(h.finalMs), W / 2, H / 2 + 140);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = F.body;
    ctx.fillText(
      `${h.detail} · ${new Date(h.solve.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      W / 2,
      H / 2 + 220,
    );
    credit(ctx, style, F);
    ctx.globalAlpha = 1;
    fade(ctx, at.t, CARD_MS);
    return;
  }

  if (at.kind === "solve") {
    const seg = m.segments[at.index];
    const h = seg.highlight;
    renderReelDesign(ctx, seg.timeline, at.t, {
      accent: style.accent,
      title: `${KIND_ICON[h.kind]} ${h.caption}`,
      subtitle: `${at.index + 1} / ${n}`,
      credit: style.credit,
      sans: style.sans,
      mono: style.mono,
    });
    const local = at.t + (seg.solveStartMs - seg.startMs - CARD_MS);
    fade(ctx, local, seg.endMs - seg.startMs - CARD_MS);
    return;
  }

  // Finale: every highlight's time as a stacked scoreboard, fastest lit.
  background(ctx, style.accent, 0.5 + 0.5 * Math.sin(at.t / 180));
  const k = easeOut(at.t / 600);
  ctx.globalAlpha = k;
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, 800, 80, sans, style.title, maxW);
  ctx.fillText(style.title, W / 2, 350);
  setSpacing(ctx, 4);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = F.caption;
  ctx.fillText(style.subtitle.toUpperCase(), W / 2, 406);
  setSpacing(ctx, 0);
  const rows = [...m.segments].sort((a, b) => a.highlight.finalMs - b.highlight.finalMs);
  const rowH = Math.min(120, 600 / Math.max(1, rows.length));
  rows.forEach((seg, i) => {
    const y = 530 + i * rowH;
    const rk = easeOut((at.t - i * 120) / 400);
    ctx.globalAlpha = rk * k;
    roundRectPath(ctx, SAFE_X, y - 62, maxW, rowH - 16, 26);
    ctx.fillStyle = i === 0 ? style.accent : "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = i === 0 ? "#0c0a17" : "rgba(255,255,255,0.85)";
    ctx.font = F.chip;
    ctx.fillText(`${KIND_ICON[seg.highlight.kind]}  ${seg.highlight.caption}`, SAFE_X + 36, y);
    ctx.textAlign = "right";
    ctx.font = `700 50px ${mono}`;
    ctx.fillText(fmt(seg.highlight.finalMs), W - SAFE_X - 36, y + 4);
    ctx.textAlign = "center";
  });
  ctx.globalAlpha = k;
  const totalMoves = m.segments.reduce((a, s) => a + s.highlight.moves, 0);
  const totalSec = m.segments.reduce((a, s) => a + s.highlight.solve.timeMs, 0) / 1000;
  ctx.fillStyle = "rgba(255,255,255,0.66)";
  ctx.font = F.body;
  ctx.fillText(`${totalMoves} turns · ${(totalMoves / Math.max(0.001, totalSec)).toFixed(2)} TPS average`, W / 2, 1260);
  credit(ctx, style, F);
  ctx.globalAlpha = 1;
  fade(ctx, at.t, Infinity);
}
