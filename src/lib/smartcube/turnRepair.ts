import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";

/**
 * Recovering a solve that lost a turn over Bluetooth.
 *
 * When a move packet never arrives, the app's record of the solve is missing
 * that turn: replayed from the scramble it ends a turn or two short of solved,
 * even though the real cube was solved (the cube's own state report is what
 * caught it). The time stands either way — but without the turns there's no
 * recap, no case recognition, no replay.
 *
 * The missing turn can usually be put back exactly. With the recorded turns
 * t0…t(n-1) and scramble S, a lone missing turn M at position i means
 *   S·t0…t(i-1) · M · ti…t(n-1) = solved,
 * so M = (S·t0…t(i-1))⁻¹ · (ti…t(n-1))⁻¹. For each position that's one small
 * cube to build and look up among every turn (or pair of turns, for two
 * packets lost together) — cheap, exact, and it says *where* the turn went
 * missing. A turn the cube reported twice is the mirror case: deleting it
 * solves the scramble.
 */

export interface TurnRepair {
  /** The corrected turn list. */
  tokens: string[];
  /** Ms from the first turn, one per token; recovered turns sit between their neighbours. */
  times: number[];
  /** What was changed, for telling the cuber. */
  change: { kind: "inserted" | "removed"; /** Index in `tokens` (inserted) or in the original list (removed). */ index: number; tokens: string[] };
  /** How many other places would have solved it equally well (commuting neighbours, mostly). */
  alternatives: number;
}

const FACES = ["U", "R", "F", "D", "L", "B"];
const SUFFIXES = ["", "'", "2"];
const TURNS = FACES.flatMap((f) => SUFFIXES.map((s) => f + s));

function key(c: CubeJSInstance): string {
  return `${c.cp.join("")}|${c.co.join("")}|${c.ep.join("")}|${c.eo.join("")}`;
}

const IDENTITY = key(new Cube());

/** Every turn, and every two-turn sequence on different faces, by the cube it makes. */
function buildLookup(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (alg: string[]) => {
    const c = new Cube();
    c.move(alg.join(" "));
    const k = key(c);
    if (!out.has(k)) out.set(k, alg); // shortest first: singles are added before pairs
  };
  for (const t of TURNS) add([t]);
  for (const a of TURNS) for (const b of TURNS) if (a[0] !== b[0]) add([a, b]);
  return out;
}

let lookup: Map<string, string[]> | null = null;

function invertToken(t: string): string {
  return t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`;
}

const invertAlg = (alg: readonly string[]): string[] => [...alg].reverse().map(invertToken);

function cubeOf(alg: readonly string[]): CubeJSInstance {
  const c = new Cube();
  if (alg.length) c.move(alg.join(" "));
  return c;
}

/**
 * Tries to make `tokens` solve `scramble` by putting back one lost turn (or
 * two, lost together), or by dropping one duplicated turn. Returns "intact"
 * when they already solve it, null when no single repair does.
 */
export function repairLostTurns(scramble: string, tokens: readonly string[], times: readonly number[]): TurnRepair | "intact" | null {
  if (tokens.length === 0 || tokens.length !== times.length) return null;
  const s = scramble.split(/\s+/).filter(Boolean);
  if (key(cubeOf([...s, ...tokens])) === IDENTITY) return "intact";
  lookup ??= buildLookup();

  type Candidate = { at: number; insert: string[]; gap: number };
  const inserts: Candidate[] = [];
  const invS = invertAlg(s);
  for (let i = 0; i <= tokens.length; i++) {
    // M = (S·prefix)⁻¹ · (tail)⁻¹, as one algorithm on a solved cube.
    const alg = [...invertAlg(tokens.slice(0, i)), ...invS, ...invertAlg(tokens.slice(i))];
    const hit = lookup.get(key(cubeOf(alg)));
    if (!hit) continue;
    const before = i > 0 ? times[i - 1] : times[0];
    const after = i < tokens.length ? times[i] : times[tokens.length - 1];
    inserts.push({ at: i, insert: hit, gap: after - before });
  }

  const deletions: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const rest = [...s, ...tokens.slice(0, i), ...tokens.slice(i + 1)];
    if (key(cubeOf(rest)) === IDENTITY) deletions.push(i);
  }

  // Cheapest explanation first. A turn repeated right after itself is almost
  // certainly an echo, so dropping it beats inserting an inverse beside it.
  const echo = deletions.find((i) => (i > 0 && tokens[i] === tokens[i - 1]) || (i + 1 < tokens.length && tokens[i] === tokens[i + 1]));
  inserts.sort((a, b) => a.insert.length - b.insert.length || b.gap - a.gap || a.at - b.at);
  const bestInsert = inserts[0];

  const removal = (i: number): TurnRepair => ({
    tokens: tokens.filter((_, k) => k !== i),
    times: times.filter((_, k) => k !== i),
    change: { kind: "removed", index: i, tokens: [tokens[i]] },
    alternatives: inserts.length + deletions.length - 1,
  });
  const insertion = (best: Candidate): TurnRepair => {
    const out: { tokens: string[]; times: number[] } = { tokens: [], times: [] };
    const lo = best.at > 0 ? times[best.at - 1] : times[0];
    const hi = best.at < tokens.length ? times[best.at] : times[tokens.length - 1];
    for (let i = 0; i < best.at; i++) {
      out.tokens.push(tokens[i]);
      out.times.push(times[i]);
    }
    best.insert.forEach((t, j) => {
      out.tokens.push(t);
      out.times.push(Math.round(lo + ((hi - lo) * (j + 1)) / (best.insert.length + 1)));
    });
    for (let i = best.at; i < tokens.length; i++) {
      out.tokens.push(tokens[i]);
      out.times.push(times[i]);
    }
    return { ...out, change: { kind: "inserted", index: best.at, tokens: best.insert }, alternatives: inserts.length - 1 + deletions.length };
  };

  if (echo !== undefined) return removal(echo);
  if (bestInsert && bestInsert.insert.length === 1) return insertion(bestInsert);
  if (deletions.length > 0) return removal(deletions[0]);
  if (bestInsert) return insertion(bestInsert);
  return null;
}
