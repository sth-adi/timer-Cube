/**
 * Turns a scramble into a blindfold memo: the sequence of Speffz letters a
 * cuber would need to remember to solve corners and edges via a buffer
 * method (Old Pochmann style — see bldLettering.ts for the scheme). Pure
 * cycle decomposition over the scramble's own permutation/orientation
 * arrays, no search involved.
 */

import { cubeFromAlg, type CubeJSInstance } from "../cube-engine/engine";
import { CORNER_LETTER, EDGE_LETTER, letterName } from "./bldLettering";

export interface BldMemo {
  /** Letter cycles for corners, each already excluding the buffer where applicable. */
  cornerWords: string[][];
  edgeWords: string[][];
  /** True once every corner (besides the buffer, if solved) needs no memo — i.e. corners are already solved. */
  cornersSolved: boolean;
  edgesSolved: boolean;
}

/**
 * Decomposes the letter-graph `next(letter) = letter of whatever piece is
 * currently sitting where `letter` lives` into cycles, starting from the
 * fixed buffer (letter 0 = "A") and then any leftover uncovered letters.
 * This is exactly how a human builds Old-Pochmann-style memo by hand: look
 * at the buffer, follow where the piece there belongs, keep going until
 * you're back at the buffer, then repeat for whatever's left.
 */
function buildCycles(letterTable: readonly (readonly number[])[], perm: readonly number[], orient: readonly number[], mod: number): string[][] {
  const totalLetters = letterTable.length * mod;
  const posOf: { slot: number; n: number }[] = new Array(totalLetters);
  for (let slot = 0; slot < letterTable.length; slot++) {
    for (let n = 0; n < mod; n++) posOf[letterTable[slot][n]] = { slot, n };
  }

  const next = (letter: number): number => {
    const { slot, n: k } = posOf[letter];
    const piece = perm[slot];
    const ori = orient[slot];
    const n = ((k - ori) % mod + mod) % mod;
    return letterTable[piece][n];
  };

  const covered = new Array(totalLetters).fill(false);
  const cycles: number[][] = [];

  // The buffer's own cycle: its word excludes the buffer letter itself,
  // since that position is the one you're always looking at first — no
  // need to memorize "start here."
  covered[0] = true;
  {
    const word: number[] = [];
    let cur = next(0);
    while (cur !== 0) {
      word.push(cur);
      covered[cur] = true;
      cur = next(cur);
    }
    if (word.length > 0) cycles.push(word);
  }

  // Any pieces untouched by the buffer's cycle form their own cycles, each
  // starting from a virtual buffer — this time the starting letter *is*
  // part of the word, since there's no "look at the buffer" freebie.
  for (let letter = 1; letter < totalLetters; letter++) {
    if (covered[letter]) continue;
    const word: number[] = [letter];
    covered[letter] = true;
    let cur = next(letter);
    while (cur !== letter) {
      word.push(cur);
      covered[cur] = true;
      cur = next(cur);
    }
    if (word.length > 1) cycles.push(word);
    // length 1 means this position is already correctly solved — nothing to memo.
  }

  return cycles.map((word) => word.map(letterName));
}

/** Exported for direct testing against hand-constructed permutation/orientation arrays. */
export function cornerMemoCycles(cp: readonly number[], co: readonly number[]): string[][] {
  return buildCycles(CORNER_LETTER, cp, co, 3);
}

export function edgeMemoCycles(ep: readonly number[], eo: readonly number[]): string[][] {
  return buildCycles(EDGE_LETTER, ep, eo, 2);
}

export function buildBldMemo(scramble: string): BldMemo {
  const cube: CubeJSInstance = cubeFromAlg(scramble);
  const cornerWords = cornerMemoCycles(cube.cp, cube.co);
  const edgeWords = edgeMemoCycles(cube.ep, cube.eo);
  return {
    cornerWords,
    edgeWords,
    cornersSolved: cornerWords.length === 0,
    edgesSolved: edgeWords.length === 0,
  };
}

/** Groups a flat letter sequence into pairs for mnemonic pairing, e.g. ["A","B","C"] -> ["AB","C"]. */
export function pairUp(letters: readonly string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < letters.length; i += 2) {
    pairs.push(i + 1 < letters.length ? letters[i] + letters[i + 1] : letters[i]);
  }
  return pairs;
}
