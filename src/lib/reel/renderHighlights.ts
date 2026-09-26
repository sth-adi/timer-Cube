import { REEL_H, REEL_W, renderReelFrame } from "./renderFrame";
import { CARD_MS, OPENER_MS, montageAt, type HighlightKind, type Montage } from "./highlights";

const SANS = "system-ui, -apple-system, Segoe UI, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export interface HighlightStyle {
  accent: string;
  title: string;
  subtitle: string;
}

const KIND_ICON: Record<HighlightKind, string> = { pb: "★", fastest: "⚡", tps: "✋", efficient: "◆" };

function fmt(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const s = cs / 100;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2);
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function background(ctx: CanvasRenderingContext2D, accent: string, pulse = 0) {
  const bg = ctx.createLinearGradient(0, 0, 0, REEL_H);
  bg.addColorStop(0, "#0c0a17");
  bg.addColorStop(1, "#16112b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  const glow = ctx.createRadialGradient(REEL_W / 2, REEL_H / 2, 40, REEL_W / 2, REEL_H / 2, 560 + pulse * 80);
  glow.addColorStop(0, `${accent}66`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
}

/** Fade from/to black over `ms` at either end of a span of length `len`, at local time `t`. */
function fade(ctx: CanvasRenderingContext2D, t: number, len: number, ms = 220) {
  const a = t < ms ? 1 - t / ms : t > len - ms ? (t - (len - ms)) / ms : 0;
  if (a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
}

/**
 * One frame of a Highlight Reel at montage time `t`: the opener, a caption
 * card, a solve playing (the regular Solve Reel frame, captioned), or the
 * finale — with a quick fade at every cut.
 */
export function renderHighlightFrame(ctx: CanvasRenderingContext2D, m: Montage, t: number, style: HighlightStyle): void {
  const at = montageAt(m, t);
  const W = REEL_W;
  const H = REEL_H;
  const n = m.segments.length;
  ctx.textAlign = "center";

  if (at.kind === "opener") {
    background(ctx, style.accent, easeOut(at.t / 800));
    const k = easeOut(at.t / 700);
    ctx.globalAlpha = k;
    ctx.fillStyle = "#ffffff88";
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText(style.subtitle.toUpperCase(), W / 2, H / 2 - 170);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.round(120 + 20 * k)}px ${SANS}`;
    ctx.fillText(style.title, W / 2, H / 2 - 30);
    ctx.fillStyle = style.accent;
    ctx.font = `700 44px ${SANS}`;
    const best = Math.min(...m.segments.map((s) => s.highlight.finalMs));
    ctx.fillText(`${n} solve${n === 1 ? "" : "s"} · best ${fmt(best)}`, W / 2, H / 2 + 70);
    ctx.globalAlpha = 1;
    fade(ctx, at.t, OPENER_MS);
    return;
  }

  if (at.kind === "card") {
    const h = m.segments[at.index].highlight;
    background(ctx, style.accent, 1);
    const k = easeOut(at.t / 450);
    ctx.globalAlpha = k;
    ctx.fillStyle = "#ffffff66";
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText(`${at.index + 1} / ${n}`, W / 2, H / 2 - 230);
    ctx.fillStyle = style.accent;
    ctx.font = `800 110px ${SANS}`;
    ctx.fillText(KIND_ICON[h.kind], W / 2, H / 2 - 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 92px ${SANS}`;
    ctx.fillText(h.caption, W / 2 + (1 - k) * 60, H / 2 + 10);
    ctx.fillStyle = "#ffffffcc";
    ctx.font = `800 120px ${MONO}`;
    ctx.fillText(fmt(h.finalMs), W / 2, H / 2 + 150);
    ctx.fillStyle = "#ffffff88";
    ctx.font = `500 32px ${SANS}`;
    ctx.fillText(
      `${h.detail} · ${new Date(h.solve.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      W / 2,
      H / 2 + 225,
    );
    ctx.globalAlpha = 1;
    fade(ctx, at.t, CARD_MS);
    return;
  }

  if (at.kind === "solve") {
    const seg = m.segments[at.index];
    const h = seg.highlight;
    renderReelFrame(ctx, seg.timeline, at.t, {
      accent: style.accent,
      title: `${KIND_ICON[h.kind]} ${h.caption}`,
      subtitle: `${at.index + 1}/${n}`,
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
  ctx.font = `900 76px ${SANS}`;
  ctx.fillText(style.title, W / 2, 250);
  ctx.fillStyle = "#ffffff77";
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(style.subtitle.toUpperCase(), W / 2, 305);
  const rows = [...m.segments].sort((a, b) => a.highlight.finalMs - b.highlight.finalMs);
  rows.forEach((seg, i) => {
    const y = 430 + i * 120;
    const rk = easeOut((at.t - i * 120) / 400);
    ctx.globalAlpha = rk;
    ctx.fillStyle = i === 0 ? style.accent : "#ffffff14";
    ctx.beginPath();
    ctx.roundRect(120, y - 64, W - 240, 96, 28);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = i === 0 ? "#0c0a17" : "#ffffffcc";
    ctx.font = `700 38px ${SANS}`;
    ctx.fillText(`${KIND_ICON[seg.highlight.kind]}  ${seg.highlight.caption}`, 160, y);
    ctx.textAlign = "right";
    ctx.font = `800 50px ${MONO}`;
    ctx.fillText(fmt(seg.highlight.finalMs), W - 160, y + 4);
    ctx.textAlign = "center";
  });
  ctx.globalAlpha = 1;
  const totalMoves = m.segments.reduce((a, s) => a + s.highlight.moves, 0);
  const totalSec = m.segments.reduce((a, s) => a + s.highlight.solve.timeMs, 0) / 1000;
  ctx.fillStyle = "#ffffffaa";
  ctx.font = `600 34px ${SANS}`;
  ctx.fillText(`${totalMoves} turns · ${(totalMoves / Math.max(0.001, totalSec)).toFixed(2)} TPS average`, W / 2, H - 120);
  fade(ctx, at.t, Infinity);
}
