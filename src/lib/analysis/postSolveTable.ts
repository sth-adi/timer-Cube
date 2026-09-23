import type { SmartCubeMove } from "@/lib/store/smartCubeStore";

export interface PostSolvePhaseRow {
  label: string;
  group: "OLL" | "PLL" | null;
  caseName: string | null;
  /**
   * Which physical F2L slot (0=URF/FR, 1=UFL/FL, 2=ULB/BL, 3=UBR/BR — see
   * f2lPairSolved) this row is, for F2L rows only. The label itself is
   * always in *solve order* ("F2L 1".."F2L 4"), since a cuber inserts pairs
   * in whatever order they find them, not fixed slot order — this is what
   * lets a row's icon still show the right physical pair.
   */
  f2lPairIndex: 0 | 1 | 2 | 3 | null;
  /** Absolute timestamp this phase became reachable at (the previous phase's end) — the moment its case was in front of you. */
  startMs: number | null;
  /** Absolute timestamp (same clock as SmartCubeMove.timeStampMs) this phase finished at — lets a row's icon reconstruct exactly the cube state at that moment by replaying `moves` up to here, without re-deriving it from totalMs arithmetic. Null wherever the boundary itself is still unknown. */
  atMs: number | null;
  totalMs: number | null;
  /** Ms between the phase becoming reachable and the first move made toward it — the "reading the case" pause. */
  recognitionMs: number | null;
  /** Ms actually spent turning through the phase, from that first move to the phase finishing. */
  executionMs: number | null;
}

/**
 * Ms between a phase boundary becoming known and the first move made after
 * it, plus everything from there to the next boundary — recognition and
 * execution are two different skills, and a single phase-total time hides
 * which one is actually the bottleneck. Works for any phase, not just
 * OLL/PLL: Cross's "recognition" is always 0 (its start boundary *is* the
 * first move, by definition — see startedAtMs), but F2L's is a genuinely
 * useful "how long did you stare before finding the first pair" number.
 */
function recognitionSplit(
  moves: SmartCubeMove[],
  phaseStartMs: number | null,
  phaseEndMs: number | null,
): { recognitionMs: number | null; executionMs: number | null } {
  if (phaseStartMs === null || phaseEndMs === null) return { recognitionMs: null, executionMs: null };
  // A skip (this phase's boundary lands on the same event as the previous
  // one) has no algorithm to split into recognition/execution.
  if (phaseStartMs === phaseEndMs) return { recognitionMs: null, executionMs: null };
  const firstMove = moves.find((m) => m.timeStampMs > phaseStartMs);
  if (!firstMove) return { recognitionMs: null, executionMs: null };
  return {
    recognitionMs: firstMove.timeStampMs - phaseStartMs,
    executionMs: phaseEndMs - firstMove.timeStampMs,
  };
}

/**
 * One row per F2L pair, in the order the cuber actually solved them (not
 * fixed slot order — see f2lPairIndex's doc comment). Each pair's own
 * boundary is its individual completion timestamp from smartCubeStore's
 * f2lPairAtMs, chained the same way Cross/OLL/PLL chain off the previous
 * phase's end, starting from crossAtMs. A pair not yet solved (null in
 * f2lPairAtMs — solve still in progress, or, on a real cube, effectively
 * never since bottomLayerSolved requires all 4) is appended at the end with
 * a null total, same "—" treatment every other unresolved boundary gets.
 */
function buildF2lPairRows(
  moves: SmartCubeMove[],
  crossAtMs: number | null,
  f2lPairAtMs: (number | null)[],
): PostSolvePhaseRow[] {
  const indexed = f2lPairAtMs.map((atMs, pairIndex) => ({ pairIndex: pairIndex as 0 | 1 | 2 | 3, atMs }));
  const known = indexed.filter((p): p is { pairIndex: 0 | 1 | 2 | 3; atMs: number } => p.atMs !== null);
  known.sort((a, b) => a.atMs - b.atMs);
  const unknown = indexed.filter((p) => p.atMs === null);
  const ordered = [...known, ...unknown];

  const rows: PostSolvePhaseRow[] = [];
  let prevBoundary = crossAtMs;
  for (let i = 0; i < ordered.length; i++) {
    const { pairIndex, atMs } = ordered[i];
    const totalMs = prevBoundary !== null && atMs !== null ? atMs - prevBoundary : null;
    const split = recognitionSplit(moves, prevBoundary, atMs);
    rows.push({
      label: `F2L ${i + 1}`,
      group: null,
      caseName: null,
      f2lPairIndex: pairIndex,
      startMs: prevBoundary,
      atMs,
      totalMs,
      recognitionMs: split.recognitionMs,
      executionMs: split.executionMs,
    });
    if (atMs !== null) prevBoundary = atMs;
  }
  return rows;
}

/**
 * The Cubeast-style post-solve breakdown: one row per CFOP phase (F2L
 * expanded into one row per pair, in solve order), each with its case
 * (where one applies), total time, and the recognition/execution split
 * within it. All boundary timestamps (`startedAtMs` through `solvedAtMs`,
 * plus each pair's own in `f2lPairAtMs`) are already tracked live off the
 * cube's own state — see smartCubeStore — so this is a pure readout over
 * existing data, not a new pass over the solve.
 */
export function buildPostSolveRows(opts: {
  moves: SmartCubeMove[];
  startedAtMs: number | null;
  crossAtMs: number | null;
  f2lPairAtMs: (number | null)[];
  ollAtMs: number | null;
  /** The solve's end boundary — pass null while the solve isn't actually finished yet, so the PLL row doesn't show a bogus in-progress total. */
  solvedAtMs: number | null;
  ollCaseName: string | null;
  pllCaseName: string | null;
}): PostSolvePhaseRow[] {
  const { moves, startedAtMs, crossAtMs, f2lPairAtMs, ollAtMs, solvedAtMs, ollCaseName, pllCaseName } = opts;

  const crossTotalMs = startedAtMs !== null && crossAtMs !== null ? crossAtMs - startedAtMs : null;
  const crossRow: PostSolvePhaseRow = {
    label: "Cross",
    group: null,
    caseName: null,
    f2lPairIndex: null,
    startMs: startedAtMs,
    atMs: crossAtMs,
    totalMs: crossTotalMs,
    // Cross is a special case: its start boundary (startedAtMs) *is* the
    // timestamp of its own first move, by definition — there's no clock
    // running before it to have a recognition pause against, unlike every
    // later phase's boundary, which is the timestamp of the *previous*
    // phase's last move.
    recognitionMs: crossTotalMs !== null ? 0 : null,
    executionMs: crossTotalMs,
  };

  const f2lRows = buildF2lPairRows(moves, crossAtMs, f2lPairAtMs);
  // OLL/PLL still chain off f2lAtMs-equivalent — the last F2L pair's own
  // boundary is exactly that moment (bottomLayerSolved requires all 4).
  const f2lEndMs = f2lPairAtMs.every((at) => at !== null) ? Math.max(...(f2lPairAtMs as number[])) : null;

  const ollSplit = recognitionSplit(moves, f2lEndMs, ollAtMs);
  const ollRow: PostSolvePhaseRow = {
    label: "OLL",
    group: "OLL",
    caseName: ollCaseName,
    f2lPairIndex: null,
    startMs: f2lEndMs,
    atMs: ollAtMs,
    totalMs: f2lEndMs !== null && ollAtMs !== null ? ollAtMs - f2lEndMs : null,
    recognitionMs: ollSplit.recognitionMs,
    executionMs: ollSplit.executionMs,
  };

  const pllSplit = recognitionSplit(moves, ollAtMs, solvedAtMs);
  const pllRow: PostSolvePhaseRow = {
    label: "PLL",
    group: "PLL",
    caseName: pllCaseName,
    f2lPairIndex: null,
    startMs: ollAtMs,
    atMs: solvedAtMs,
    totalMs: ollAtMs !== null && solvedAtMs !== null ? solvedAtMs - ollAtMs : null,
    recognitionMs: pllSplit.recognitionMs,
    executionMs: pllSplit.executionMs,
  };

  return [crossRow, ...f2lRows, ollRow, pllRow];
}
