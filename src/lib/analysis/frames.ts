/**
 * Frame conversion between "whatever face the solver's cross lives on" and
 * "whatever face the *user's* cross lives on".
 *
 * The rest of this app solves with the cross on U (see cube-engine/engine.ts),
 * but a reconstruction is written in whatever orientation the cuber held the
 * cube in — nearly always white cross on D. Rather than teach every solver a
 * second convention, we relabel the *moves*: conjugating an alg by a whole-cube
 * rotation is a relabeling of face letters, and relabeling is a group
 * automorphism, so a relabeled scramble + relabeled solution still solves.
 *
 * The tables are derived from the engine at first use rather than hand-typed,
 * so they can't silently disagree with it. `frames.test.ts` pins the outer-face
 * rows so a change in the engine's move definitions surfaces as a test failure.
 */

import { Cube } from "../cube-engine/engine";
import type { Move } from "./notation";

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

/**
 * Whole-cube rotation that carries each face into the U position, read off the
 * engine's own `center` array (see frames.test.ts).
 */
const ROTATION_TO_U: Record<Face, string> = {
  U: "",
  D: "x2",
  F: "x",
  B: "x'",
  R: "z'",
  L: "z",
};

const BASES = ["U", "R", "F", "D", "L", "B", "E", "M", "S", "x", "y", "z", "u", "r", "f", "d", "l", "b"];

function allTokens(): string[] {
  const out: string[] = [];
  for (const b of BASES) for (const s of ["", "2", "'"]) out.push(b + s);
  return out;
}

function stateKey(alg: string): string {
  const c = new Cube();
  if (alg) c.move(alg);
  return JSON.stringify([c.center, c.cp, c.co, c.ep, c.eo]);
}

function invertRotation(rot: string): string {
  if (!rot) return "";
  if (rot.endsWith("2")) return rot;
  if (rot.endsWith("'")) return rot.slice(0, -1);
  return `${rot}'`;
}

/** token -> equivalent token in the rotated frame. */
export type TokenMap = Readonly<Record<string, string>>;

const mapCache = new Map<string, TokenMap>();

/**
 * Builds the relabeling induced by conjugating with `rotation`. A move `t`
 * becomes the move with the same effect on a cube held `rotation` differently,
 * which the engine can identify for us: that is the token whose state matches
 * `rotation⁻¹ · t · rotation`.
 */
function buildMap(rotation: string): TokenMap {
  const cached = mapCache.get(rotation);
  if (cached) return cached;

  const byState = new Map<string, string>();
  for (const t of allTokens()) byState.set(stateKey(t), t);

  const map: Record<string, string> = {};
  const inverse = invertRotation(rotation);
  for (const t of allTokens()) {
    const conjugated = rotation ? `${inverse} ${t} ${rotation}` : t;
    const match = byState.get(stateKey(conjugated));
    if (!match) {
      // Unreachable: conjugating a single move by a whole-cube rotation always
      // lands on another single move. Fail loudly rather than silently drop it.
      throw new Error(`No token equivalent to ${t} conjugated by ${rotation}`);
    }
    map[t] = match;
  }

  mapCache.set(rotation, map);
  return map;
}

/** Relabeling that moves a solve done with the cross on `face` into the cross-on-U frame. */
export function mapToSolverFrame(face: Face): TokenMap {
  return buildMap(ROTATION_TO_U[face]);
}

/** The inverse relabeling: cross-on-U frame back into the user's frame. */
export function mapFromSolverFrame(face: Face): TokenMap {
  return buildMap(invertRotation(ROTATION_TO_U[face]));
}

/**
 * Relabeling from the solver frame (cross U / last layer D) into the frame the
 * algorithm library uses (last layer U), which every published OLL and PLL
 * algorithm assumes.
 */
export function mapToLibraryFrame(): TokenMap {
  return buildMap(ROTATION_TO_U.D);
}

export function relabelToken(token: string, map: TokenMap): string {
  const mapped = map[token];
  if (!mapped) throw new Error(`Cannot relabel unknown token "${token}"`);
  return mapped;
}

export function relabelAlg(alg: string, map: TokenMap): string {
  const parts = alg.trim().split(/\s+/).filter(Boolean);
  return parts.map((t) => relabelToken(t, map)).join(" ");
}

export function relabelMoves(moves: readonly Move[], map: TokenMap): Move[] {
  return moves.map((m) => {
    const token = relabelToken(m.token, map);
    const amountSuffix = token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1;
    return {
      ...m,
      token,
      base: token.replace(/['2]$/, ""),
      amount: amountSuffix as 1 | 2 | 3,
    };
  });
}

/** Relabels a two-letter F2L slot name such as "FR" face by face. */
export function relabelSlotName(name: string, map: TokenMap): string {
  return name
    .split("")
    .map((letter) => relabelToken(letter, map))
    .join("");
}
