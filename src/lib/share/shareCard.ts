import type { SessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

const WIDTH = 1080;
const HEIGHT = 1080;

/** Draws a shareable summary card (session name, key stats, date) onto a freshly-created canvas. */
export function drawShareCard(opts: { sessionName: string; stats: SessionStats }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#12141a");
  bg.addColorStop(1, "#050608");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(45, 212, 191, 0.10)";
  ctx.beginPath();
  ctx.arc(WIDTH * 0.86, HEIGHT * 0.1, 260, 0, Math.PI * 2);
  ctx.fill();

  const marginX = 72;

  ctx.fillStyle = "#7d8291";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(opts.sessionName.toUpperCase(), marginX, 110);

  ctx.fillStyle = "#eef0f3";
  ctx.font = "800 52px system-ui, sans-serif";
  ctx.fillText("Cube Timer", marginX, 172);

  ctx.fillStyle = "#2dd4bf";
  ctx.font = "800 240px system-ui, sans-serif";
  ctx.fillText(opts.stats.best !== null ? formatTime(opts.stats.best) : "—", marginX, 460);

  ctx.fillStyle = "#7d8291";
  ctx.font = "500 34px system-ui, sans-serif";
  ctx.fillText("BEST SINGLE", marginX, 520);

  const cells: [string, string][] = [
    ["ao5", opts.stats.ao5 !== null ? formatTime(opts.stats.ao5) : "—"],
    ["ao12", opts.stats.ao12 !== null ? formatTime(opts.stats.ao12) : "—"],
    ["mean", opts.stats.mean !== null ? formatTime(opts.stats.mean) : "—"],
    ["solves", String(opts.stats.count)],
  ];

  const gridTop = 640;
  const colWidth = (WIDTH - marginX * 2) / 4;
  cells.forEach(([label, value], i) => {
    const x = marginX + i * colWidth;
    ctx.fillStyle = "#eef0f3";
    ctx.font = "700 52px system-ui, sans-serif";
    ctx.fillText(value, x, gridTop);
    ctx.fillStyle = "#7d8291";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillText(label.toUpperCase(), x, gridTop + 44);
  });

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, gridTop + 90);
  ctx.lineTo(WIDTH - marginX, gridTop + 90);
  ctx.stroke();

  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  ctx.fillStyle = "#5b606c";
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillText(date, marginX, HEIGHT - 64);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
