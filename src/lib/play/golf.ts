import { Cube, cubeFromAlg, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { mergeTurn } from "@/lib/smartcube/scrambleGuide";
import { moveLabel } from "@/lib/solvers/moveNotation";

/**
 * Cube Golf: a short scramble, and par is the *true* shortest solution —
 * not an estimate. Every position within 4 turns of solved is tabled once
 * (46,741 of them); a hole's scramble is searched outward 4 turns from where
 * it stands and matched against that table, which finds the exact optimum for
 * anything up to 8 turns from solved (half turns count as one, the usual
 * "HTM"). Your strokes are your solution's length once it's simplified —
 * R R' costs nothing, R R is one stroke (R2) — so you can tie par but never
 * beat it.
 */

/** How far each side of the meeting search goes; optimal lengths up to 2× this are exact. */
const HALF_DEPTH = 4;
export const MAX_EXACT_PAR = HALF_DEPTH * 2;

const ALL_MOVES: { face: number; power: 0 | 1 | 2; label: string; inverse: string }[] = [];
for (let face = 0; face < 6; face++) {
  for (const power of [0, 1, 2] as const) {
    const label = moveLabel(face, power);
    ALL_MOVES.push({ face, power, label, inverse: moveLabel(face, power === 0 ? 2 : power === 2 ? 0 : 1) });
  }
}

function key(c: CubeJSInstance): string {
  let k = "";
  for (let i = 0; i < 8; i++) k += c.cp[i] * 3 + c.co[i] + ",";
  for (let i = 0; i < 12; i++) k += c.ep[i] * 2 + c.eo[i] + ",";
  return k;
}

function turned(c: CubeJSInstance, face: number, power: 0 | 1 | 2): CubeJSInstance {
  const child = c.clone();
  for (let t = 0; t <= power; t++) child.multiply(Cube.moves[face]);
  return child;
}

interface Node {
  cube: CubeJSInstance;
  depth: number;
  /** The turn that, from this position, steps one closer to the start of the search. */
  back: string | null;
  parent: string | null;
}

/** Breadth-first from `start` out to `depth` turns. */
function explore(start: CubeJSInstance, depth: number): Map<string, Node> {
  const seen = new Map<string, Node>();
  seen.set(key(start), { cube: start, depth: 0, back: null, parent: null });
  let frontier: string[] = [key(start)];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const k of frontier) {
      const node = seen.get(k)!;
      for (const m of ALL_MOVES) {
        const child = turned(node.cube, m.face, m.power);
        const ck = key(child);
        if (seen.has(ck)) continue;
        seen.set(ck, { cube: child, depth: d + 1, back: m.inverse, parent: k });
        next.push(ck);
      }
    }
    frontier = next;
  }
  return seen;
}

let solvedTable: Map<string, Node> | null = null;
/** Every position within HALF_DEPTH turns of solved, built once. */
function fromSolved(): Map<string, Node> {
  return (solvedTable ??= explore(newCube(), HALF_DEPTH));
}

/**
 * A shortest solution (in turns) for the position `start`, or null when it's
 * more than `maxPar` turns from solved (at most MAX_EXACT_PAR). A lower
 * `maxPar` searches less: the table already covers 4 turns from solved, so
 * only the rest has to be searched outward from `start`.
 */
export function optimalSolution(start: CubeJSInstance, maxPar: number = MAX_EXACT_PAR): string[] | null {
  const table = fromSolved();
  const forward = explore(start.clone(), Math.min(HALF_DEPTH, Math.max(0, maxPar - HALF_DEPTH)));
  let best: { k: string; total: number } | null = null;
  for (const [k, node] of forward) {
    const other = table.get(k);
    if (!other) continue;
    const total = node.depth + other.depth;
    if (!best || total < best.total) best = { k, total };
  }
  if (!best) return null;

  // start → meeting position, following the forward search's parents…
  const head: string[] = [];
  for (let k = best.k; ; ) {
    const node = forward.get(k)!;
    if (node.parent === null) break;
    // `back` on a forward node undoes the step into it; its inverse is the step itself.
    const step = ALL_MOVES.find((m) => m.inverse === node.back)!;
    head.push(step.label);
    k = node.parent;
  }
  head.reverse();
  // …then meeting position → solved, following the table's way home.
  const tail: string[] = [];
  let cube = table.get(best.k)!.cube;
  for (let node = table.get(best.k)!; node.back !== null; node = table.get(key(cube))!) {
    tail.push(node.back);
    const m = ALL_MOVES.find((x) => x.label === node.back)!;
    cube = turned(cube, m.face, m.power);
  }
  return [...head, ...tail];
}

/** True when `solution` really solves `scramble` — the check behind every par shown. */
export function solves(scramble: readonly string[], solution: readonly string[]): boolean {
  const c = cubeFromAlg(scramble.join(" "));
  c.move(solution.join(" "));
  return key(c) === key(newCube());
}

export interface Hole {
  scramble: string[];
  /** Fewest turns that solve it. */
  par: number;
  /** One way to do it in `par` turns. */
  solution: string[];
}

function step(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** A random-walk scramble of `length` turns with no turn folding into the one before it. */
function walk(length: number, seed: number): { moves: string[]; seed: number } {
  const moves: string[] = [];
  let lastFace = -1;
  let prevFace = -1;
  while (moves.length < length) {
    let r: number;
    [r, seed] = step(seed);
    const m = ALL_MOVES[Math.floor(r * ALL_MOVES.length)];
    if (m.face === lastFace) continue;
    // Opposite faces commute: keep one canonical order so L R and R L aren't both generated.
    if (prevFace >= 0 && m.face === prevFace && lastFace % 3 === m.face % 3) continue;
    prevFace = lastFace;
    lastFace = m.face;
    moves.push(m.label);
  }
  return { moves, seed };
}

/**
 * A hole whose par is exactly `par` turns (2 to MAX_EXACT_PAR): random
 * scrambles are drawn until one's true optimum equals the length asked for.
 */
export function generateHole(par: number, seed: number): Hole {
  if (par < 2 || par > MAX_EXACT_PAR) throw new RangeError(`par must be 2-${MAX_EXACT_PAR}`);
  for (let attempt = 0; attempt < 500; attempt++) {
    const w = walk(par, seed);
    seed = w.seed;
    const solution = optimalSolution(cubeFromAlg(w.moves.join(" ")), par);
    if (solution && solution.length === par) return { scramble: w.moves, par, solution };
  }
  throw new Error(`couldn't find a par-${par} scramble`);
}

/** Your strokes: the length of what you've turned, once cancelling turns are merged. */
export function countStrokes(turns: readonly string[]): number {
  return turns.reduce<string[]>((acc, t) => mergeTurn(acc, t), []).length;
}

export function scoreLabel(strokes: number, par: number): string {
  const over = strokes - par;
  if (over <= 0) return "Par — the shortest possible";
  if (over === 1) return "One over";
  return `${over} over`;
}
