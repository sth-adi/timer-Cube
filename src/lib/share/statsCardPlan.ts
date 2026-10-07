import { CARD_FORMATS, gridColumns, safeBox, type Box, type CardFormat } from "./cardLayout";

/**
 * Where everything on the stats card goes, as boxes — pure, so the grid can be
 * tested for overlaps and safe margins without drawing anything. Optional
 * pieces (trend, phase bar) give their space back to the others when absent.
 */
export interface StatsPlanInput {
  format: CardFormat;
  cells: number;
  hasTrend: boolean;
  hasPhases: boolean;
}

export interface StatsPlan {
  header: Box;
  title: Box;
  hero: Box;
  /** One box per stat cell, inside `grid`. */
  grid: Box;
  cellBoxes: Box[];
  trend: Box | null;
  phases: Box | null;
  /** Big cube shown when there is neither a trend nor a phase bar. */
  emblem: Box | null;
  footerY: number;
  cubeSize: number;
  /** Right edge of the footer line (the link card keeps its footer under the left column). */
  footerRight: number;
}

/** Height of the phase-bar panel: caption, bar, then a label and a value line under each segment. */
export const PHASES_H = 156;

export function planStatsCard(input: StatsPlanInput): StatsPlan {
  const spec = CARD_FORMATS[input.format];
  const safe = safeBox(spec);
  const n = Math.max(1, input.cells);
  const footerY = safe.y + safe.h;

  if (input.format === "portrait") {
    const cubeSize = 112;
    const header: Box = { x: safe.x, y: safe.y, w: safe.w, h: cubeSize };
    const title: Box = { x: safe.x, y: header.y + header.h + 36, w: safe.w, h: 92 };
    const hero: Box = { x: safe.x, y: title.y + title.h + 14, w: safe.w, h: 262 };
    const grid: Box = { x: safe.x, y: hero.y + hero.h + 28, w: safe.w, h: 156 };
    const regionTop = grid.y + grid.h + 32;
    const regionBottom = footerY - 52;
    const region: Box = { x: safe.x, y: regionTop, w: safe.w, h: regionBottom - regionTop };
    let trend: Box | null = null;
    let phases: Box | null = null;
    let emblemBox: Box | null = null;
    if (input.hasTrend && input.hasPhases) {
      const phasesH = PHASES_H;
      trend = { ...region, h: region.h - phasesH - 20 };
      phases = { x: region.x, y: trend.y + trend.h + 20, w: region.w, h: phasesH };
    } else if (input.hasTrend) {
      trend = { ...region, h: Math.min(region.h, 330) };
    } else if (input.hasPhases) {
      phases = { ...region, h: PHASES_H };
      emblemBox = { x: region.x, y: phases.y + phases.h + 10, w: region.w, h: region.h - phases.h - 10 };
    } else {
      emblemBox = region;
    }
    return { header, title, hero, grid, cellBoxes: cellBoxes(grid, n, gridColumns(n, 4)), trend, phases, emblem: emblemBox, footerY, cubeSize, footerRight: safe.x + safe.w };
  }

  // Link preview: two columns, the headline on the left and the numbers on the right.
  const gap = 56;
  const leftW = Math.round(safe.w * 0.5);
  const rightX = safe.x + leftW + gap;
  const rightW = safe.x + safe.w - rightX;
  const cubeSize = 76;
  const header: Box = { x: safe.x, y: safe.y, w: leftW, h: cubeSize };
  const title: Box = { x: safe.x, y: header.y + header.h + 22, w: leftW, h: 78 };
  const hero: Box = { x: safe.x, y: title.y + title.h + 10, w: leftW, h: footerY - 46 - (title.y + title.h + 10) };
  const gridCols = n === 4 ? 2 : gridColumns(n, 3);
  const gridRows = Math.ceil(n / gridCols);
  const grid: Box = { x: rightX, y: safe.y, w: rightW, h: gridRows === 1 ? 118 : 184 };
  const rest = footerY - (grid.y + grid.h + 22);
  const phasesH = PHASES_H;
  let trend: Box | null = null;
  let phases: Box | null = null;
  let emblemBox: Box | null = null;
  const topY = grid.y + grid.h + 22;
  if (input.hasTrend && input.hasPhases) {
    trend = { x: rightX, y: topY, w: rightW, h: rest - phasesH - 16 };
    phases = { x: rightX, y: trend.y + trend.h + 16, w: rightW, h: phasesH };
  } else if (input.hasTrend) {
    trend = { x: rightX, y: topY, w: rightW, h: rest };
  } else if (input.hasPhases) {
    phases = { x: rightX, y: topY, w: rightW, h: phasesH };
  } else {
    emblemBox = { x: rightX, y: topY, w: rightW, h: rest };
  }
  return { header, title, hero, grid, cellBoxes: cellBoxes(grid, n, gridCols), trend, phases, emblem: emblemBox, footerY, cubeSize, footerRight: safe.x + leftW };
}

/** The cells of the stat grid, row-major, each `cols` wide in equal columns. */
export function cellBoxes(grid: Box, n: number, cols: number): Box[] {
  const rows = Math.ceil(n / cols);
  const cw = grid.w / cols;
  const ch = grid.h / rows;
  return Array.from({ length: n }, (_, i) => ({ x: grid.x + (i % cols) * cw, y: grid.y + Math.floor(i / cols) * ch, w: cw, h: ch }));
}
