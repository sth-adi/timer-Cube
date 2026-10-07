import type { SessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import {
  brandMark,
  caps,
  createCard,
  emblem,
  fitText,
  footer,
  heroGradient,
  paintBackground,
  panel,
  phasePanel,
  sparkPanel,
  withGlow,
  type PhaseShare,
} from "./cardKit";
import { rgba, type CardFormat } from "./cardLayout";
import { ensureCardFonts, readCardTheme, warmCardFonts } from "./cardTheme";
import { planStatsCard } from "./statsCardPlan";

// Fonts are fetched by the page anyway; asking now means they are ready when someone taps Share.
warmCardFonts();

export interface ShareCardOptions {
  sessionName: string;
  stats: SessionStats;
  /** "portrait" (1080x1350, the default) or "link" (1200x630, exported at 2x). */
  format?: CardFormat;
  /** Shown bottom-right as @name when given. */
  username?: string | null;
  /** The latest solve times, oldest first (ms; null or Infinity = DNF), for the trend line. */
  recent?: (number | null)[];
  /** The average solve split into phases, for the phase bar. */
  phases?: PhaseShare[];
  /** Overrides today's date (tests, reproducible exports). */
  date?: Date;
}

export interface StatCell {
  label: string;
  value: string;
  /** True for a DNF average, which is shown but dimmed. */
  bad?: boolean;
}

export interface CardHero {
  label: string;
  value: string;
}

/** The headline number: the best average the session has (ao12, else ao5), else the best single. */
export function heroFor(stats: SessionStats): CardHero {
  if (stats.ao12 !== null) return { label: "Average of 12", value: formatTime(stats.ao12) };
  if (stats.ao5 !== null) return { label: "Average of 5", value: formatTime(stats.ao5) };
  if (stats.best !== null) return { label: "Best single", value: formatTime(stats.best) };
  return { label: stats.count > 0 ? "No finished solve yet" : "No solves yet", value: stats.count > 0 ? "DNF" : "—" };
}

/** The supporting numbers under the hero: never the hero's own metric, never an empty "—", at most four. */
export function statCells(stats: SessionStats): StatCell[] {
  const hero = heroFor(stats).label;
  const cells: StatCell[] = [];
  if (hero !== "Best single" && stats.best !== null) cells.push({ label: "Best", value: formatTime(stats.best) });
  if (hero !== "Average of 5") {
    if (stats.ao5 !== null) cells.push({ label: "ao5", value: formatTime(stats.ao5) });
    else if (stats.ao5Dnf) cells.push({ label: "ao5", value: "DNF", bad: true });
  }
  if (hero !== "Average of 12") {
    if (stats.ao12 !== null) cells.push({ label: "ao12", value: formatTime(stats.ao12) });
    else if (stats.ao12Dnf) cells.push({ label: "ao12", value: "DNF", bad: true });
  }
  if (stats.mean !== null && stats.solveCount >= 2) cells.push({ label: "Mean", value: formatTime(stats.mean) });
  const solves: StatCell = { label: `${stats.count === 1 ? "Solve" : "Solves"}${stats.dnfCount > 0 ? ` · ${stats.dnfCount} DNF` : ""}`, value: String(stats.count) };
  // Keep "Solves" last and trim the least interesting (the mean) when five would not fit.
  while (cells.length > 3) cells.splice(cells.length - 1, 1);
  cells.push(solves);
  return cells;
}

/** Cleans a raw series for the trend: the last `limit` entries, with Infinity and NaN as null (DNF). */
export function trendSeries(recent: (number | null)[] | undefined, limit = 40): (number | null)[] {
  return (recent ?? []).slice(-limit).map((v) => (v === null || !Number.isFinite(v) ? null : v));
}

function hasTrend(series: (number | null)[]): boolean {
  return series.filter((v) => v !== null).length >= 2;
}

/** Draws the shareable summary card: session, headline number, key stats, trend and phases. Draw after `ensureCardFonts()` (or use `renderShareCard`) so the app font is used. */
export function drawShareCard(opts: ShareCardOptions): HTMLCanvasElement {
  const format = opts.format ?? "portrait";
  const theme = readCardTheme();
  const card = createCard(format, theme);
  if (!card.ctx) return card.canvas;
  const { ctx } = card;

  const series = trendSeries(opts.recent);
  const trendOn = hasTrend(series);
  const phases = opts.phases && opts.phases.length >= 2 ? opts.phases : undefined;
  const cells = statCells(opts.stats);
  const plan = planStatsCard({ format, cells: cells.length, hasTrend: trendOn, hasPhases: !!phases });
  const portrait = format === "portrait";
  const sans = theme.fontSans;
  const fg = rgba(theme.fg, 1);

  paintBackground(card, "right");
  brandMark(card, plan.header.x, plan.header.y, plan.cubeSize, "Cube Timer", "Session stats");

  // Session name.
  const name = opts.sessionName.trim() || "Session";
  caps(card, "Session", plan.title.x, plan.title.y + 20, plan.title.w, { px: portrait ? 22 : 18 });
  fitText(ctx, name, plan.title.x, plan.title.y + plan.title.h - 8, plan.title.w, {
    maxPx: portrait ? 56 : 40,
    minPx: portrait ? 30 : 24,
    family: sans,
    weight: 750,
    color: fg,
    tracking: -0.4,
  });

  // Hero.
  const hero = heroFor(opts.stats);
  caps(card, hero.label, plan.hero.x, plan.hero.y + (portrait ? 30 : 24), plan.hero.w, { px: portrait ? 28 : 22, color: rgba(theme.accent, 1) });
  const heroPx = Math.min(portrait ? 270 : 230, plan.hero.h * 0.78);
  const heroBase = plan.hero.y + plan.hero.h - (portrait ? 14 : 6);
  withGlow(card, theme.accent, 44, () => {
    fitText(ctx, hero.value, plan.hero.x - 4, heroBase, plan.hero.w, {
      maxPx: heroPx,
      minPx: Math.round(heroPx * 0.45),
      family: sans,
      weight: 800,
      color: heroGradient(card, heroBase - heroPx * 0.72, heroBase),
      tracking: -heroPx * 0.025,
    });
  });

  // Stat grid.
  panel(card, plan.grid, 28);
  plan.cellBoxes.forEach((b, i) => {
    const c = cells[i];
    if (i > 0 && (b.x > plan.grid.x + 1)) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h * 0.2);
      ctx.lineTo(b.x, b.y + b.h * 0.8);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(theme.fg, 0.1);
      ctx.stroke();
    }
    const padX = portrait ? 26 : 22;
    const inner = b.w - padX * 2;
    const valueBase = b.y + b.h * (portrait ? 0.6 : b.h > 100 ? 0.5 : 0.58);
    fitText(ctx, c.value, b.x + padX, valueBase, inner, {
      maxPx: portrait ? 58 : 44,
      minPx: 22,
      family: sans,
      weight: 750,
      color: c.bad ? rgba(theme.danger, 1) : fg,
      tracking: -0.5,
    });
    caps(card, c.label, b.x + padX, valueBase + (portrait ? 40 : 32), inner, { px: portrait ? 20 : 17 });
  });

  // Trend, phases, or the cube alone.
  if (plan.trend) {
    const finite = series.filter((v): v is number => v !== null);
    sparkPanel(card, plan.trend, series, {
      title: `Last ${series.length} solves`,
      badge: finite.length ? `Best ${formatTime(Math.min(...finite))}` : undefined,
    });
  }
  if (plan.phases && phases) phasePanel(card, plan.phases, phases, (ms) => `${(ms / 1000).toFixed(1)}s`);
  if (plan.emblem) emblem(card, plan.emblem);

  const date = (opts.date ?? new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const user = opts.username?.trim();
  footer(card, plan.footerY, date, user ? `@${user.replace(/^@/, "")}` : "", plan.footerRight);

  return card.canvas;
}

/** `drawShareCard` once the app fonts are loaded — what the Share button calls. */
export async function renderShareCard(opts: ShareCardOptions): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  return drawShareCard(opts);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
