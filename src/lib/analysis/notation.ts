/**
 * Parsing for hand-typed / pasted solve reconstructions.
 *
 * Reconstructions in the wild are messy: they come from alg.cubing.net links,
 * YouTube descriptions, reconstruction sites and people typing into a box.
 * They carry comments, bracketing, curly quotes, and three different spellings
 * of a wide move. This module normalizes all of that down to the exact token
 * vocabulary the vendored cubejs engine accepts, and reports anything it
 * can't understand with enough context to fix it.
 */

export type MoveKind = "outer" | "wide" | "slice" | "rotation";

export interface Move {
  /** Canonical engine-parsable token, e.g. "R", "U2", "r'", "M", "x2". */
  token: string;
  /** Base letter in engine vocabulary: U R F D L B / E M S / x y z / u r f d l b. */
  base: string;
  /** 1 = clockwise, 2 = half turn, 3 = counter-clockwise. */
  amount: 1 | 2 | 3;
  kind: MoveKind;
  /** The token exactly as the user wrote it, for error messages and echoing back. */
  raw: string;
}

export interface ParseResult {
  moves: Move[];
  /** Human-readable problems; when non-empty, `moves` is not trustworthy. */
  errors: string[];
}

const OUTER = new Set(["U", "R", "F", "D", "L", "B"]);
const SLICE = new Set(["E", "M", "S"]);
const ROTATION = new Set(["x", "y", "z"]);
const WIDE = new Set(["u", "r", "f", "d", "l", "b"]);

function kindOf(base: string): MoveKind | null {
  if (OUTER.has(base)) return "outer";
  if (SLICE.has(base)) return "slice";
  if (ROTATION.has(base)) return "rotation";
  if (WIDE.has(base)) return "wide";
  return null;
}

/**
 * Everything that is punctuation rather than a move. Reconstructions bracket
 * trigger pairs `[R U R' U']`, group pairs `(R U R')`, mark pauses with `.`
 * or `·`, and separate stages with `/` or `|`.
 */
const PUNCTUATION = /[()[\]{}<>,;:|/\\.·•+\-–—]/g;

function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block */
    .replace(/\/\/[^\n]*/g, " ") // // line
    .replace(/^\s*#[^\n]*/gm, " "); // # line
}

function normalizeGlyphs(input: string): string {
  return input
    .replace(/[‘’ʼʹ′´`]/g, "'") // curly / prime / backtick
    .replace(/[“”]/g, "'")
    .replace(/ /g, " ");
}

/**
 * Reduces one already-isolated token to `{base, amount}`. Accepts the three
 * common wide spellings (`Rw`, `r`, `2R`), `3` as a synonym for `'`, and
 * redundant modifier orders like `R2'` / `R'2` (both mean R2).
 */
function parseToken(raw: string): { base: string; amount: 1 | 2 | 3 } | string {
  let body = raw;

  // SiGN-style leading layer count: 2R === Rw, 2Uw === Uw. Anything deeper
  // than 2 layers is not a 3x3 move at all.
  const layerPrefix = /^(\d)(?=[A-Za-z])/.exec(body);
  let forcedWide = false;
  if (layerPrefix) {
    if (layerPrefix[1] !== "2") return `"${raw}" turns ${layerPrefix[1]} layers, which isn't a 3x3 move`;
    forcedWide = true;
    body = body.slice(1);
  }

  const letter = body[0];
  if (!letter || !/[A-Za-z]/.test(letter)) return `"${raw}" doesn't start with a face letter`;
  body = body.slice(1);

  // `Rw` / `Rw'` — the w belongs to the letter, not the modifiers.
  if (body[0] === "w" || body[0] === "W") {
    forcedWide = true;
    body = body.slice(1);
  }

  let base = letter;
  if (forcedWide) {
    if (!OUTER.has(letter.toUpperCase())) return `"${raw}" isn't a face that can be turned wide`;
    base = letter.toLowerCase();
  } else if (ROTATION.has(letter.toLowerCase())) {
    base = letter.toLowerCase(); // accept X/Y/Z as x/y/z
  }

  if (kindOf(base) === null) return `"${raw}" isn't a move I recognize`;

  // Modifiers: any mix of digits and primes. Two primes cancel, 2 and ' both
  // present means a half turn either way (R2' === R2).
  let quarterTurns = 1;
  let sawCount = false;
  let primes = 0;
  for (const ch of body) {
    if (ch === "'") {
      primes++;
    } else if (ch >= "1" && ch <= "9") {
      if (sawCount) return `"${raw}" has more than one turn count`;
      sawCount = true;
      quarterTurns = Number(ch);
    } else if (/\s/.test(ch)) {
      continue;
    } else {
      return `"${raw}" has a trailing "${ch}" I don't understand`;
    }
  }
  if (primes % 2 === 1) quarterTurns = -quarterTurns;

  const normalized = ((quarterTurns % 4) + 4) % 4;
  if (normalized === 0) return `"${raw}" is a full 360° turn, which does nothing`;

  return { base, amount: normalized as 1 | 2 | 3 };
}

function suffixFor(amount: 1 | 2 | 3): string {
  return amount === 1 ? "" : amount === 2 ? "2" : "'";
}

/** Builds the canonical engine token for a base letter and turn amount. */
export function makeToken(base: string, amount: 1 | 2 | 3): string {
  return base + suffixFor(amount);
}

/**
 * Parses a free-form reconstruction or scramble into canonical moves.
 * Never throws: unrecognized input comes back in `errors`.
 */
export function parseMoves(input: string): ParseResult {
  const cleaned = normalizeGlyphs(stripComments(input)).replace(PUNCTUATION, " ");
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);

  const moves: Move[] = [];
  const errors: string[] = [];

  for (const raw of rawTokens) {
    const parsed = parseToken(raw);
    if (typeof parsed === "string") {
      errors.push(parsed);
      // Keep scanning so the user sees every problem at once, not one per fix.
      continue;
    }
    const kind = kindOf(parsed.base)!;
    moves.push({
      token: makeToken(parsed.base, parsed.amount),
      base: parsed.base,
      amount: parsed.amount,
      kind,
      raw,
    });
  }

  return { moves, errors };
}

/** Joins moves back into a space-separated alg string the engine can apply. */
export function movesToAlg(moves: readonly Move[]): string {
  return moves.map((m) => m.token).join(" ");
}

export interface MoveMetrics {
  /** Slice turn metric: every face, wide or slice turn counts 1; rotations free. */
  stm: number;
  /** Execution turn metric: STM plus cube rotations, i.e. every physical action. */
  etm: number;
  /** Quarter turn metric: half turns count 2. */
  qtm: number;
  rotations: number;
}

export function countMoves(moves: readonly Move[]): MoveMetrics {
  let stm = 0;
  let qtm = 0;
  let rotations = 0;
  for (const m of moves) {
    if (m.kind === "rotation") {
      rotations++;
      continue;
    }
    stm++;
    qtm += m.amount === 2 ? 2 : 1;
  }
  return { stm, etm: stm + rotations, qtm, rotations };
}
