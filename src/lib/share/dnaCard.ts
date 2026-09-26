import type { DnaAxis } from "@/lib/stats/dna";

const WIDTH = 1080;
const HEIGHT = 1080;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 600;
const MAX_RADIUS = 250;
const RINGS = [1 / 3, 2 / 3, 1];
const ACCENT = "#2dd4bf";

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CENTER_X + radius * Math.sin(angle), y: CENTER_Y - radius * Math.cos(angle) };
}

function ringPath(ctx: CanvasRenderingContext2D, radius: number, n: number) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = polar(radius, (i / n) * Math.PI * 2);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/**
 * The shareable poster for a solver's "DNA" — the same self-referential
 * radar axes the on-page RadarChart draws, re-rendered here on a canvas
 * (rather than exporting the live SVG directly) so it gets the same
 * dark-gradient poster treatment as drawShareCard, at export resolution
 * rather than whatever size the on-page chart happens to be laid out at.
 */
export function drawDnaCard(opts: { sessionName: string; axes: DnaAxis[] }): HTMLCanvasElement {
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

  ctx.fillStyle = "rgba(124, 92, 255, 0.10)";
  ctx.beginPath();
  ctx.arc(WIDTH * 0.14, HEIGHT * 0.08, 260, 0, Math.PI * 2);
  ctx.fill();

  const marginX = 72;
  ctx.textAlign = "left";
  ctx.fillStyle = "#7d8291";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(opts.sessionName.toUpperCase(), marginX, 110);

  ctx.fillStyle = "#eef0f3";
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.fillText("Cube DNA", marginX, 190);

  const n = opts.axes.length;
  if (n >= 3) {
    for (const r of RINGS) {
      ringPath(ctx, r * MAX_RADIUS, n);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const p = polar(MAX_RADIUS, (i / n) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(CENTER_X, CENTER_Y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    opts.axes.forEach((a, i) => {
      const p = polar((a.score / 100) * MAX_RADIUS, (i / n) * Math.PI * 2);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(45, 212, 191, 0.22)";
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.stroke();

    opts.axes.forEach((a, i) => {
      const p = polar((a.score / 100) * MAX_RADIUS, (i / n) * Math.PI * 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
    });

    opts.axes.forEach((a, i) => {
      const angle = (i / n) * Math.PI * 2;
      const p = polar(MAX_RADIUS + 44, angle);
      const sin = Math.sin(angle);
      ctx.textAlign = sin > 0.3 ? "left" : sin < -0.3 ? "right" : "center";
      ctx.fillStyle = "#eef0f3";
      ctx.font = "700 23px system-ui, sans-serif";
      ctx.fillText(a.label.toUpperCase(), p.x, p.y - 4);
      ctx.fillStyle = "#7d8291";
      ctx.font = "500 20px system-ui, sans-serif";
      ctx.fillText(String(Math.round(a.score)), p.x, p.y + 20);
    });
  }

  ctx.textAlign = "left";
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  ctx.fillStyle = "#5b606c";
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillText(date, marginX, HEIGHT - 64);

  return canvas;
}

function miniRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, axes: DnaAxis[], ghost: DnaAxis[] | null) {
  const n = axes.length;
  if (n < 3) return;
  const pt = (r: number, i: number) => ({ x: cx + r * Math.sin((i / n) * Math.PI * 2), y: cy - r * Math.cos((i / n) * Math.PI * 2) });
  const poly = (radii: number[]) => {
    ctx.beginPath();
    radii.forEach((r, i) => {
      const p = pt(r, i);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  };
  poly(Array(n).fill(radius));
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const ghostScores = ghost ? axes.map((a) => ghost.find((g) => g.label === a.label)?.score) : null;
  if (ghostScores?.every((x) => x !== undefined)) {
    poly(ghostScores.map((x) => (x! / 100) * radius));
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  poly(axes.map((a) => (a.score / 100) * radius));
  ctx.fillStyle = "rgba(45, 212, 191, 0.22)";
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/**
 * The evolution poster: the last few periods' radars side by side (each
 * with the one before ghosted behind it), the trait that defined each, and
 * the average-time trend underneath.
 */
export function drawDnaTimelineCard(opts: {
  sessionName: string;
  snapshots: { label: string; axes: DnaAxis[]; trait: { name: string }; meanMs: number | null }[];
  headline: string;
}): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#12141a");
  bg.addColorStop(1, "#050608");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#7d8291";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(opts.sessionName.toUpperCase(), 72, 100);
  ctx.fillStyle = "#eef0f3";
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.fillText("Cube DNA · Evolution", 72, 178);

  const shown = opts.snapshots.slice(-6);
  const cols = 3;
  const cellW = (W - 144) / cols;
  shown.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = 72 + cellW * col + cellW / 2;
    const cy = 360 + row * 360;
    const prev = i > 0 ? shown[i - 1] : null;
    miniRadar(ctx, cx, cy, 105, s.axes, prev?.axes ?? null);
    ctx.textAlign = "center";
    ctx.fillStyle = "#eef0f3";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.fillText(s.label, cx, cy + 150);
    ctx.fillStyle = ACCENT;
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(s.trait.name, cx, cy + 180);
  });

  // Average-time trend.
  const means = shown.map((s) => s.meanMs).filter((m): m is number => m !== null);
  if (means.length >= 2) {
    const top = 1080;
    const h = 130;
    const lo = Math.min(...means);
    const hi = Math.max(...means);
    const x = (i: number) => 120 + (i / (shown.length - 1)) * (W - 240);
    const y = (m: number) => top + (hi === lo ? h / 2 : ((m - lo) / (hi - lo)) * h);
    ctx.beginPath();
    let started = false;
    shown.forEach((s, i) => {
      if (s.meanMs === null) return;
      if (!started) ctx.moveTo(x(i), y(s.meanMs));
      else ctx.lineTo(x(i), y(s.meanMs));
      started = true;
    });
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 4;
    ctx.stroke();
    shown.forEach((s, i) => {
      if (s.meanMs === null) return;
      ctx.beginPath();
      ctx.arc(x(i), y(s.meanMs), 7, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.fillStyle = "#b9bdc7";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText((s.meanMs / 1000).toFixed(2), x(i), y(s.meanMs) - 16);
    });
    ctx.fillStyle = "#5b606c";
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("AVERAGE", 72, top - 24);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#b9bdc7";
  ctx.font = "500 28px system-ui, sans-serif";
  const words = opts.headline.split(" ");
  let line = "";
  let ly = H - 70;
  const lines: string[] = [];
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > W - 144 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  ly -= (lines.length - 1) * 36;
  for (const l of lines) {
    ctx.fillText(l, 72, ly);
    ly += 36;
  }
  return canvas;
}
