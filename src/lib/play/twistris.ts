/**
 * Twistris: a falling-block game played with a Rubik's cube as the
 * controller. Pure and deterministic (seeded 7-bag), so a whole game can be
 * replayed from its seed and inputs; the page only draws the state and
 * turns cube moves into actions.
 */

export const COLS = 10;
export const ROWS = 20;
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export const PIECES: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** Cells of each piece in its spawn rotation, as [col, row] offsets. */
const SHAPES: Record<PieceType, [number, number][]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const BOX: Record<PieceType, number> = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

export interface Active {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

export interface Game {
  /** ROWS × COLS; 0 empty, else 1 + index into PIECES. */
  board: number[][];
  active: Active;
  queue: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  over: boolean;
  seed: number;
  /** Rows cleared by the last lock, for a flash animation. */
  lastClear: number[];
}

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

/** The next 7-bag, shuffled from a seed; returns the bag and the seed to use after it. */
function bag(seed: number): { pieces: PieceType[]; seed: number } {
  const r = rng(seed);
  const pieces = [...PIECES];
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return { pieces, seed: Math.floor(r() * 2 ** 31) };
}

export function cells(a: Active): [number, number][] {
  const n = BOX[a.type];
  return SHAPES[a.type].map(([cx, cy]) => {
    let x = cx;
    let y = cy;
    for (let k = 0; k < ((a.rot % 4) + 4) % 4; k++) [x, y] = [n - 1 - y, x];
    return [a.x + x, a.y + y];
  });
}

function fits(board: number[][], a: Active): boolean {
  return cells(a).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || board[y][x] === 0));
}

function spawn(type: PieceType): Active {
  return { type, rot: 0, x: type === "O" ? 3 : 3, y: -1 };
}

function refill(g: Game): Game {
  if (g.queue.length >= 7) return g;
  const b = bag(g.seed);
  return { ...g, queue: [...g.queue, ...b.pieces], seed: b.seed };
}

function nextPiece(g: Game): Game {
  const filled = refill(g);
  const [type, ...rest] = filled.queue;
  const active = spawn(type);
  return { ...filled, active, queue: rest, canHold: true, over: !fits(filled.board, active) };
}

export function newGame(seed = Date.now()): Game {
  const empty = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  const start: Game = { board: empty, active: spawn("I"), queue: [], hold: null, canHold: true, score: 0, lines: 0, level: 1, over: false, seed, lastClear: [] };
  return nextPiece(start);
}

const LINE_SCORE = [0, 100, 300, 500, 800];

function lock(g: Game): Game {
  const board = g.board.map((r) => [...r]);
  let toppedOut = false;
  for (const [x, y] of cells(g.active)) {
    if (y < 0) toppedOut = true;
    else board[y][x] = PIECES.indexOf(g.active.type) + 1;
  }
  const full = board.map((r, i) => (r.every((c) => c !== 0) ? i : -1)).filter((i) => i >= 0);
  const kept = board.filter((_, i) => !full.includes(i));
  while (kept.length < ROWS) kept.unshift(Array<number>(COLS).fill(0));
  const lines = g.lines + full.length;
  const next: Game = {
    ...g,
    board: kept,
    lines,
    level: Math.floor(lines / 10) + 1,
    score: g.score + LINE_SCORE[full.length] * g.level,
    lastClear: full,
  };
  if (toppedOut) return { ...next, over: true };
  return nextPiece(next);
}

export function shift(g: Game, dx: number): Game {
  if (g.over) return g;
  const a = { ...g.active, x: g.active.x + dx };
  return fits(g.board, a) ? { ...g, active: a } : g;
}

/** Rotates with simple wall kicks — sideways, then up — so a piece against a wall or the stack still turns. */
export function rotate(g: Game, dir: 1 | -1): Game {
  if (g.over || g.active.type === "O") return g;
  for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
    const a = { ...g.active, rot: g.active.rot + dir, x: g.active.x + kx, y: g.active.y + ky };
    if (fits(g.board, a)) return { ...g, active: a };
  }
  return g;
}

/** Gravity or a soft drop: one row down, locking if it can't fall. */
export function step(g: Game, soft = false): Game {
  if (g.over) return g;
  const a = { ...g.active, y: g.active.y + 1 };
  if (fits(g.board, a)) return { ...g, active: a, score: g.score + (soft ? 1 : 0), lastClear: [] };
  return lock(g);
}

export function hardDrop(g: Game): Game {
  if (g.over) return g;
  let a = g.active;
  let dropped = 0;
  while (fits(g.board, { ...a, y: a.y + 1 })) {
    a = { ...a, y: a.y + 1 };
    dropped++;
  }
  return lock({ ...g, active: a, score: g.score + dropped * 2 });
}

export function hold(g: Game): Game {
  if (g.over || !g.canHold) return g;
  if (g.hold === null) return { ...nextPiece({ ...g, hold: g.active.type }), canHold: false };
  const active = spawn(g.hold);
  return { ...g, hold: g.active.type, active, canHold: false };
}

/** Where the active piece would land — drawn as a ghost. */
export function ghost(g: Game): Active {
  let a = g.active;
  while (fits(g.board, { ...a, y: a.y + 1 })) a = { ...a, y: a.y + 1 };
  return a;
}

/** Ms between gravity steps at a level. */
export function gravityMs(level: number): number {
  return Math.max(90, 800 - (level - 1) * 70);
}

export type TwistrisAction = "left" | "right" | "cw" | "ccw" | "soft" | "drop" | "hold";

export function apply(g: Game, action: TwistrisAction): Game {
  switch (action) {
    case "left":
      return shift(g, -1);
    case "right":
      return shift(g, 1);
    case "cw":
      return rotate(g, 1);
    case "ccw":
      return rotate(g, -1);
    case "soft":
      return step(g, true);
    case "drop":
      return hardDrop(g);
    case "hold":
      return hold(g);
  }
}
