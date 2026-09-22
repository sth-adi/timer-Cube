import type { SmartCubeMove } from "@/lib/store/smartCubeStore";

const PHASE_LABELS = ["Cross", "F2L", "OLL", "PLL"] as const;

export interface PostSolvePhaseRow {
  label: (typeof PHASE_LABELS)[number];
  group: "OLL" | "PLL" | null;
  caseName: string | null;
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
 * The Cubeast-style post-solve breakdown: one row per CFOP phase, each with
 * its case (where one applies), total time, and the recognition/execution
 * split within it. All boundary timestamps (`startedAtMs` through
 * `solvedAtMs`) are already tracked live off the cube's own state — see
 * smartCubeStore — so this is a pure readout over existing data, not a new
 * pass over the solve.
 */
export function buildPostSolveRows(opts: {
  moves: SmartCubeMove[];
  startedAtMs: number | null;
  crossAtMs: number | null;
  f2lAtMs: number | null;
  ollAtMs: number | null;
  /** The solve's end boundary — pass null while the solve isn't actually finished yet, so the PLL row doesn't show a bogus in-progress total. */
  solvedAtMs: number | null;
  ollCaseName: string | null;
  pllCaseName: string | null;
}): PostSolvePhaseRow[] {
  const { moves, startedAtMs, crossAtMs, f2lAtMs, ollAtMs, solvedAtMs, ollCaseName, pllCaseName } = opts;

  const boundaries: (number | null)[] = [startedAtMs, crossAtMs, f2lAtMs, ollAtMs, solvedAtMs];
  const caseNameFor: Record<(typeof PHASE_LABELS)[number], string | null> = {
    Cross: null,
    F2L: null,
    OLL: ollCaseName,
    PLL: pllCaseName,
  };
  const groupFor: Record<(typeof PHASE_LABELS)[number], "OLL" | "PLL" | null> = {
    Cross: null,
    F2L: null,
    OLL: "OLL",
    PLL: "PLL",
  };

  return PHASE_LABELS.map((label, i) => {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const totalMs = start !== null && end !== null ? end - start : null;
    // Cross is a special case: its start boundary (startedAtMs) *is* the
    // timestamp of its own first move, by definition — there's no clock
    // running before it to have a recognition pause against, unlike every
    // later phase's boundary, which is the timestamp of the *previous*
    // phase's last move. recognitionSplit's ">" search would otherwise
    // skip Cross's real first move and grab its second one instead.
    const split = i === 0 ? { recognitionMs: totalMs !== null ? 0 : null, executionMs: totalMs } : recognitionSplit(moves, start, end);
    return {
      label,
      group: groupFor[label],
      caseName: caseNameFor[label],
      totalMs,
      recognitionMs: split.recognitionMs,
      executionMs: split.executionMs,
    };
  });
}
