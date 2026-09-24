/**
 * Tilt Maze: a marble labyrinth where the smart cube *is* the board. Tilt
 * the cube (gyro) to roll the marble; colored gates block the path, and
 * each opens for a few seconds when you turn the face of that color — so
 * you're balancing and twisting at once. Holes send you back to the start.
 *
 * Pure: generation is seeded, physics is a fixed step on plain data, so a
 * level is reproducible and the rules are testable without a cube.
 * Units are cells: the maze is W×H, cell (c, r) spans [c, c+1] × [r, r+1].
 */

export type GateColor = "U" | "R" | "F" | "D" | "L" | "B";
export const GATE_COLORS: readonly GateColor[] = ["R", "F", "U", "B", "L", "D"];

export interface Gate {
  color: GateColor;
  /** Wall between cell (c, r) and its east ("e") or south ("s") neighbour. */
  c: number;
  r: number;
  side: "e" | "s";
}

export interface Maze {
  w: number;
  h: number;
  /** east[r][c]: wall on the east side of (c, r). south[r][c]: wall on its south side. */
  east: boolean[][];
  south: boolean[][];
  gates: Gate[];
  holes: { x: number; y: number }[];
  start: { x: number; y: number };
  exit: { c: number; r: number };
  seed: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  gate?: GateColor;
}

export const BALL_R = 0.26;
export const WALL = 0.14;
export const HOLE_R = 0.3;
/** How long a gate stays open after you turn its face. */
export const GATE_OPEN_MS = 2600;
const ACCEL = 26;
const FRICTION = 1.6;
const BOUNCE = 0.35;
const MAX_V = 7;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Level n's size and hazards: bigger, more gates and more holes as you go. */
export function levelSpec(level: number): { w: number; h: number; gates: number; holes: number } {
  return {
    w: Math.min(9, 4 + Math.floor(level / 2)),
    h: Math.min(12, 5 + Math.floor((level + 1) / 2)),
    gates: Math.min(6, Math.floor((level + 1) / 2)),
    holes: Math.min(8, Math.max(0, level - 2)),
  };
}

/** Recursive-backtracker maze from (0,0) to the far corner, with gates placed on the one true path. */
export function generateMaze(w: number, h: number, seed: number, gateCount: number, holeCount: number): Maze {
  const r = rng(seed);
  const east = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  const south = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  const seen = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  const stack: [number, number][] = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [c, row] = stack[stack.length - 1];
    const options: [number, number][] = [
      [c + 1, row],
      [c - 1, row],
      [c, row + 1],
      [c, row - 1],
    ].filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && !seen[y][x]) as [number, number][];
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nc, nr] = options[Math.floor(r() * options.length)];
    if (nc > c) east[row][c] = false;
    else if (nc < c) east[row][nc] = false;
    else if (nr > row) south[row][c] = false;
    else south[nr][c] = false;
    seen[nr][nc] = true;
    stack.push([nc, nr]);
  }

  const exit = { c: w - 1, r: h - 1 };
  const path = solvePath({ w, h, east, south }, { c: 0, r: 0 }, exit);
  // Gates sit on doorways along the true path, spread evenly, skipping the very start and end.
  const doors: Gate[] = [];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const color = GATE_COLORS[0];
    if (a.r === b.r) doors.push({ color, c: Math.min(a.c, b.c), r: a.r, side: "e" });
    else doors.push({ color, c: a.c, r: Math.min(a.r, b.r), side: "s" });
  }
  const gates: Gate[] = [];
  const usable = doors.slice(1, -1);
  const n = Math.min(gateCount, usable.length);
  for (let k = 0; k < n; k++) {
    const d = usable[Math.floor(((k + 0.5) * usable.length) / n)];
    gates.push({ ...d, color: GATE_COLORS[k % GATE_COLORS.length] });
  }

  // Holes go in dead-end-ish cells off the true path, never the start or exit.
  const onPath = new Set(path.map((p) => `${p.c},${p.r}`));
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!onPath.has(`${x},${y}`)) candidates.push({ x: x + 0.5, y: y + 0.5 });
  const holes: { x: number; y: number }[] = [];
  while (holes.length < holeCount && candidates.length) holes.push(candidates.splice(Math.floor(r() * candidates.length), 1)[0]);

  return { w, h, east, south, gates, holes, start: { x: 0.5, y: 0.5 }, exit, seed };
}

/** Cell path from `from` to `to` through open doorways (BFS). */
export function solvePath(m: Pick<Maze, "w" | "h" | "east" | "south">, from: { c: number; r: number }, to: { c: number; r: number }) {
  const prev = new Map<string, { c: number; r: number } | null>([[`${from.c},${from.r}`, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.c === to.c && cur.r === to.r) break;
    const next: { c: number; r: number }[] = [];
    if (cur.c + 1 < m.w && !m.east[cur.r][cur.c]) next.push({ c: cur.c + 1, r: cur.r });
    if (cur.c > 0 && !m.east[cur.r][cur.c - 1]) next.push({ c: cur.c - 1, r: cur.r });
    if (cur.r + 1 < m.h && !m.south[cur.r][cur.c]) next.push({ c: cur.c, r: cur.r + 1 });
    if (cur.r > 0 && !m.south[cur.r - 1][cur.c]) next.push({ c: cur.c, r: cur.r - 1 });
    for (const n of next) {
      const k = `${n.c},${n.r}`;
      if (!prev.has(k)) {
        prev.set(k, cur);
        q.push(n);
      }
    }
  }
  const path: { c: number; r: number }[] = [];
  let cur: { c: number; r: number } | null | undefined = to;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(`${cur.c},${cur.r}`);
  }
  return path;
}

/** Every solid rectangle: outer frame, maze walls, and gates that are currently shut. */
export function solidRects(m: Maze, openGates: ReadonlySet<GateColor>): Rect[] {
  const h = WALL / 2;
  const rects: Rect[] = [
    { x0: -h, y0: -h, x1: m.w + h, y1: h },
    { x0: -h, y0: m.h - h, x1: m.w + h, y1: m.h + h },
    { x0: -h, y0: -h, x1: h, y1: m.h + h },
    { x0: m.w - h, y0: -h, x1: m.w + h, y1: m.h + h },
  ];
  for (let r = 0; r < m.h; r++)
    for (let c = 0; c < m.w; c++) {
      if (c < m.w - 1 && m.east[r][c]) rects.push({ x0: c + 1 - h, y0: r - h, x1: c + 1 + h, y1: r + 1 + h });
      if (r < m.h - 1 && m.south[r][c]) rects.push({ x0: c - h, y0: r + 1 - h, x1: c + 1 + h, y1: r + 1 + h });
    }
  for (const g of m.gates) {
    if (openGates.has(g.color)) continue;
    rects.push(
      g.side === "e"
        ? { x0: g.c + 1 - h, y0: g.r + h, x1: g.c + 1 + h, y1: g.r + 1 - h, gate: g.color }
        : { x0: g.c + h, y0: g.r + 1 - h, x1: g.c + 1 - h, y1: g.r + 1 + h, gate: g.color },
    );
  }
  return rects;
}

export type StepEvent = "none" | "fell" | "won";

/**
 * Advances the marble by dt seconds under a tilt (x right, y down, each in
 * roughly -1..1). Collides with every solid rect by pushing the ball out
 * along the contact normal and damping the velocity into it.
 */
export function stepBall(m: Maze, rects: readonly Rect[], ball: Ball, tilt: { x: number; y: number }, dt: number): { ball: Ball; event: StepEvent } {
  let { x, y, vx, vy } = ball;
  const sub = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / (BALL_R * 0.5)));
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    vx += tilt.x * ACCEL * h;
    vy += tilt.y * ACCEL * h;
    const f = Math.max(0, 1 - FRICTION * h);
    vx *= f;
    vy *= f;
    const sp = Math.hypot(vx, vy);
    if (sp > MAX_V) {
      vx *= MAX_V / sp;
      vy *= MAX_V / sp;
    }
    x += vx * h;
    y += vy * h;
    for (const rc of rects) {
      const cx = Math.max(rc.x0, Math.min(x, rc.x1));
      const cy = Math.max(rc.y0, Math.min(y, rc.y1));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= BALL_R * BALL_R) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = d2 > 0 ? dx / d : 0;
      const ny = d2 > 0 ? dy / d : -1;
      x += nx * (BALL_R - d);
      y += ny * (BALL_R - d);
      const vn = vx * nx + vy * ny;
      if (vn < 0) {
        vx -= (1 + BOUNCE) * vn * nx;
        vy -= (1 + BOUNCE) * vn * ny;
      }
    }
    for (const hole of m.holes) if (Math.hypot(x - hole.x, y - hole.y) < HOLE_R) return { ball: { ...m.start, vx: 0, vy: 0 }, event: "fell" };
    if (Math.floor(x) === m.exit.c && Math.floor(y) === m.exit.r) return { ball: { x, y, vx, vy }, event: "won" };
  }
  return { ball: { x, y, vx, vy }, event: "none" };
}
