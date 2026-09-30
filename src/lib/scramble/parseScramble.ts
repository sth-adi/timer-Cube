/**
 * Turns a scramble pasted from somewhere else — a competition sheet, csTimer,
 * a friend — into the notation this app uses, or null if it isn't a 3x3
 * scramble. Forgiving about the wrapper (numbering, curly primes, stray
 * punctuation, R2' and R'2) and strict about the content: only the six face
 * turns, nothing it would have to guess at.
 */
const MAX_TURNS = 100;

export function parseScramble(raw: string): string | null {
  const cleaned = raw
    .replace(/[’′ʼ`]/g, "'")
    .replace(/[‐-―]/g, "-")
    // "1. R U" / "Scramble: R U" style labels and list numbering
    .replace(/\b\d+[.)]\s+/g, " ")
    .replace(/scramble\s*:?/gi, " ")
    .replace(/[,;()[\]{}]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > MAX_TURNS) return null;
  const out: string[] = [];
  for (const t of tokens) {
    const m = /^([UDLRFB])(2'|'2|2|')?$/.exec(t);
    if (!m) return null;
    const suffix = m[2] === "2'" || m[2] === "'2" ? "2" : (m[2] ?? "");
    out.push(m[1] + suffix);
  }
  return out.join(" ");
}
