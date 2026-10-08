import { REEL_H, REEL_W } from "@/lib/reel/renderFrame";
import { SLIDE_MS, type Slide } from "./wrapped";

const SANS = "system-ui, -apple-system, Segoe UI, sans-serif";
/** Each slide gets its own flat backdrop, cycling, so the story reads as a sequence of cards. Dark neutrals, one tint each, no gradients. */
const BACKDROPS = ["#14181f", "#161a1e", "#1b1717", "#141a17", "#1a1814", "#15171c", "#191519", "#16161b"];

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
  ctx.fillStyle = BACKDROPS[i % BACKDROPS.length];
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
  ctx.fillStyle = accent;
  ctx.font = `600 44px ${SANS}`;
  ctx.fillText(s.kicker, 80 + dx, 420);

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
  ctx.fillText("Cube wrapped", 80, H - 70);
}
