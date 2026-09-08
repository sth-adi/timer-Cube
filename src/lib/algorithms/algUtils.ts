/**
 * Reverses and inverts a move sequence (e.g. "R U R'" -> "R U' R'"). Used to
 * turn a case-solving algorithm into the setup that reproduces that case
 * from a solved cube: setup = invert(alg), so alg always solves it back.
 */
export function invertAlg(alg: string): string {
  const moves = alg.trim().split(/\s+/).filter(Boolean);
  const inverted = moves
    .slice()
    .reverse()
    .map((m) => {
      if (m.endsWith("2")) return m;
      if (m.endsWith("'")) return m.slice(0, -1);
      return `${m}'`;
    });
  return inverted.join(" ");
}
