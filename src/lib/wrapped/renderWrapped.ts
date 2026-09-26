import { REEL_H, REEL_W } from "@/lib/reel/renderFrame";
import { SLIDE_MS, type Slide } from "./wrapped";

const SANS = "system-ui, -apple-system, Segoe UI, sans-serif";
/** Each slide gets its own backdrop, cycling — so the story reads as a sequence of cards. */
const BACKDROPS: [string, string][] = [
  ["#1b1033", "#3a1c71"],
  ["#0f2027", "#2c5364"],
  ["#2b1330", "#7a2856"],
  ["#10231a", "#1d6b4a"],
  ["#2a1a0f", "#8a4b12"],
  ["#141e30", "#243b55"],
  ["#2d0b16", "#6b1a38"],
  ["#1a1a2e", "#4b2a80"],
];

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** One frame of a Wrapped story at time `t` (ms from the first slide). */
export function renderWrappedFrame(ctx: CanvasRenderingContext2D, slides: readonly Slide[], t: number, accent: string): void {
  const W = REEL_W;
  const H = REEL_H;
  const i = Math.min(slides.length - 1, Math.max(0, Math.floor(t / SLIDE_MS)));
  const local = Math.max(0, t - i * SLIDE_MS);
  const s = slides[i];
  const [a, b] = BACKDROPS[i % BACKDROPS.length];
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, a);
  bg.addColorStop(1, b);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // A slow drifting glow so a held slide still breathes.
  const gx = W * (0.3 + 0.4 * Math.sin((t / 4000) * Math.PI));
  const glow = ctx.createRadialGradient(gx, H * 0.35, 20, gx, H * 0.35, 620);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Story progress bars.
  const gap = 10;
  const bw = (W - 120 - gap * (slides.length - 1)) / slides.length;
  slides.forEach((_, k) => {
    const x = 60 + k * (bw + gap);
    ctx.fillStyle = "#ffffff33";
    ctx.fillRect(x, 50, bw, 8);
    const fill = k < i ? 1 : k === i ? Math.min(1, local / SLIDE_MS) : 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 50, bw * fill, 8);
  });

  const slideIn = ease(local / 350);
  const dx = (1 - slideIn) * 80;
  ctx.globalAlpha = slideIn;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffffcc";
  ctx.font = `700 44px ${SANS}`;
  ctx.fillText(s.kicker.toUpperCase(), 80 + dx, 420);

  // The big number counts up; a phrase just scales in.
  const grow = ease((local - 150) / 1100);
  let big = s.big;
  if (s.count) {
    const v = s.count.to * grow;
    big = `${s.count.decimals ? v.toFixed(s.count.decimals) : Math.round(v).toLocaleString()}${s.count.suffix ?? ""}`;
    if (s.big.startsWith("−") || s.big.startsWith("+")) big = `${s.big[0]}${big}`;
  }
  const size = s.count ? 190 : big.length > 14 ? 96 : 128;
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.round(size * (0.85 + 0.15 * grow))}px ${SANS}`;
  const bigLines = wrap(ctx, big, W - 160);
  bigLines.forEach((l, k) => ctx.fillText(l, 80 + dx, 600 + k * size * 1.02));

  ctx.globalAlpha = ease((local - 550) / 500);
  ctx.fillStyle = "#ffffffdd";
  ctx.font = `500 42px ${SANS}`;
  wrap(ctx, s.line, W - 160).forEach((l, k) => ctx.fillText(l, 80, 640 + bigLines.length * size + k * 56));
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff66";
  ctx.font = `600 28px ${SANS}`;
  ctx.fillText("CUBE WRAPPED", 80, H - 70);
}
