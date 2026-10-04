/** The X-Ray page's address for a solve, so a recap opens the solve it summarised (bare /xray opens the newest). */
export function xrayHref(solveId?: string): string {
  return solveId ? `/xray?solve=${encodeURIComponent(solveId)}` : "/xray";
}

/**
 * Which solve the X-Ray page shows: the one just tapped in its strip, else the
 * one the link named, else the newest. `linkMissing` is true when the link named
 * a solve that isn't a candidate (deleted, or not a full smart-cube solve) and
 * nothing has been tapped since, so the page can say why it fell back.
 */
export function pickXraySolve<T extends { id: string }>(
  candidates: readonly T[],
  pickedId: string | null,
  linkedId: string | null,
): { selected: T | null; linkMissing: boolean } {
  const picked = pickedId ? candidates.find((s) => s.id === pickedId) : undefined;
  const linked = linkedId ? candidates.find((s) => s.id === linkedId) : undefined;
  return {
    selected: picked ?? linked ?? candidates[0] ?? null,
    linkMissing: !!linkedId && !linked && candidates.length > 0 && pickedId === null,
  };
}
