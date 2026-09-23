/**
 * Cube Health: a diagnostic of the *hardware*, not the cuber. Every
 * smart-cube solve logs exactly when each physical face turned, so across
 * enough solves each face builds up its own fingerprint:
 *
 *  - **catches** — a turn immediately undone (R then R' within a few
 *    hundred ms). That's an overshoot or a lockup being corrected, and a
 *    face that does it far more than the others is usually too loose, dry,
 *    or catching on a piece.
 *  - **drag** — how long the turn takes to come after the previous one
 *    while you're mid-flurry. A face consistently slower than its
 *    siblings is usually too tight or under-lubed.
 *  - **wear** — the same drag measured early vs. late in your history,
 *    normalised against the whole cube's change (so simply getting faster
 *    doesn't read as wear). A face slowing down relative to the rest is
 *    drying out or loosening.
 *
 * Faces are physical — named by center color, exactly as the smart cube
 * reports them — so this follows the cube, not how it was held.
 */

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

export const FACE_COLOR: Record<Face, string> = {
  U: "White",
  R: "Red",
  F: "Green",
  D: "Yellow",
  L: "Orange",
  B: "Blue",
};

/** A reversal faster than this (ms) is a correction, not a deliberate R R' in the solution. */
export const CATCH_WINDOW_MS = 300;
/** Only gaps shorter than this (ms) count as "mid-flurry" turn speed — longer ones are looks, not hardware. */
export const FLOW_GAP_MS = 400;
/** Below this many turns a face's numbers are noise. */
export const MIN_TURNS = 30;

export interface HealthSolve {
  date: number;
  reconstruction: string;
  moveTimestamps: number[];
}

export type HealthStatus = "healthy" | "watch" | "attention" | "unknown";

export interface FaceHealth {
  face: Face;
  color: string;
  turns: number;
  /** This face's share of all turns, 0-1. */
  share: number;
  catches: number;
  catchesPer100: number;
  /** Median mid-flurry gap before this face's turns (ms), or null without enough data. */
  medianGapMs: number | null;
  /** medianGapMs ÷ the whole cube's median: >1 is slower than the other faces. */
  relativeDrag: number | null;
  /** How much this face slowed (+) or sped up (−) late vs. early in the history, relative to the whole cube, as a fraction. Null without enough data in both halves. */
  wearTrend: number | null;
  score: number;
  status: HealthStatus;
  advice: string;
}

export interface CubeHealthReport {
  solvesAnalyzed: number;
  turnsAnalyzed: number;
  faces: FaceHealth[];
  overallScore: number;
  headline: string;
  /** Fastest 10-turn burst anywhere in the history, turns/sec. */
  peakTps: number | null;
}

interface TurnSample {
  face: Face;
  /** Gap since the previous turn (ms), null for a solve's first. */
  gap: number | null;
  /** Whether this turn and the previous one were a catch (same face, opposite quarter, within CATCH_WINDOW_MS). */
  isCatch: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function direction(token: string): number {
  const suffix = token.slice(1);
  return suffix === "2" ? 0 : suffix === "'" ? -1 : 1;
}

function samplesFor(solve: HealthSolve): TurnSample[] {
  const tokens = solve.reconstruction.split(/\s+/).filter(Boolean);
  const out: TurnSample[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const face = tokens[i][0] as Face;
    if (!FACES.includes(face)) continue;
    const gap = i > 0 && solve.moveTimestamps[i] !== undefined ? solve.moveTimestamps[i] - solve.moveTimestamps[i - 1] : null;
    const prev = tokens[i - 1];
    const dPrev = prev ? direction(prev) : 0;
    const dCur = direction(tokens[i]);
    const isCatch =
      prev !== undefined && prev[0] === face && dPrev !== 0 && dCur !== 0 && dPrev === -dCur && gap !== null && gap <= CATCH_WINDOW_MS;
    out.push({ face, gap, isCatch });
  }
  return out;
}

function flowGaps(samples: TurnSample[], face?: Face): number[] {
  return samples
    .filter((s) => (face ? s.face === face : true) && s.gap !== null && s.gap > 0 && s.gap < FLOW_GAP_MS && !s.isCatch)
    .map((s) => s.gap!);
}

function peakBurstTps(solves: HealthSolve[], window = 10): number | null {
  let best: number | null = null;
  for (const s of solves) {
    const t = s.moveTimestamps;
    for (let i = 0; i + window - 1 < t.length; i++) {
      const span = t[i + window - 1] - t[i];
      if (span <= 0) continue;
      const tps = ((window - 1) / span) * 1000;
      if (best === null || tps > best) best = tps;
    }
  }
  return best;
}

function statusFor(score: number, enoughData: boolean): HealthStatus {
  if (!enoughData) return "unknown";
  return score >= 85 ? "healthy" : score >= 65 ? "watch" : "attention";
}

function adviceFor(f: Omit<FaceHealth, "advice" | "status" | "score">, enoughData: boolean): string {
  const name = f.color.toLowerCase();
  if (!enoughData) return `Not enough ${name}-face turns yet to judge.`;
  const loose = f.catchesPer100 >= 2.5;
  const dragging = (f.relativeDrag ?? 1) >= 1.15;
  const wearing = (f.wearTrend ?? 0) >= 0.08;
  if (loose && dragging) {
    return `The ${name} face both drags and catches — often a dry or snagging piece. Clean it and re-lube before adjusting tension.`;
  }
  if (loose) {
    return `The ${name} face overshoots and gets corrected ${f.catchesPer100.toFixed(1)}× per 100 turns — likely too loose. Tighten it a quarter turn or use a thicker lube.`;
  }
  if (dragging) {
    return `The ${name} face turns ${Math.round(((f.relativeDrag ?? 1) - 1) * 100)}% slower than the rest of the cube mid-flurry — likely too tight or dry. Loosen it slightly or re-lube.`;
  }
  if (wearing) {
    return `The ${name} face has slowed ${Math.round((f.wearTrend ?? 0) * 100)}% relative to the rest of the cube over your history — it's drying out. Time for a re-lube.`;
  }
  return `The ${name} face is turning cleanly.`;
}

/**
 * Builds the report from saved smart-cube solves (anything with both a
 * reconstruction and per-move timestamps). Returns null with fewer than 3
 * such solves — too little to say anything about the hardware.
 */
export function buildCubeHealthReport(allSolves: readonly HealthSolve[]): CubeHealthReport | null {
  const solves = allSolves
    .filter((s) => s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 1)
    .sort((a, b) => a.date - b.date);
  if (solves.length < 3) return null;

  const perSolve = solves.map(samplesFor);
  const all = perSolve.flat();
  const half = Math.floor(perSolve.length / 2);
  const early = perSolve.slice(0, half).flat();
  const late = perSolve.slice(half).flat();

  const overallMedian = median(flowGaps(all));
  const earlyAll = median(flowGaps(early));
  const lateAll = median(flowGaps(late));

  const faces: FaceHealth[] = FACES.map((face) => {
    const mine = all.filter((s) => s.face === face);
    const catches = mine.filter((s) => s.isCatch).length;
    const medianGapMs = median(flowGaps(all, face));
    const earlyFace = median(flowGaps(early, face));
    const lateFace = median(flowGaps(late, face));
    const wearTrend =
      earlyFace && lateFace && earlyAll && lateAll && flowGaps(early, face).length >= 10 && flowGaps(late, face).length >= 10
        ? lateFace / earlyFace / (lateAll / earlyAll) - 1
        : null;
    const base = {
      face,
      color: FACE_COLOR[face],
      turns: mine.length,
      share: all.length ? mine.length / all.length : 0,
      catches,
      catchesPer100: mine.length ? (catches / mine.length) * 100 : 0,
      medianGapMs,
      relativeDrag: medianGapMs && overallMedian ? medianGapMs / overallMedian : null,
      wearTrend,
    };
    const enoughData = mine.length >= MIN_TURNS;
    const penalty =
      Math.min(45, base.catchesPer100 * 8) +
      Math.min(45, Math.max(0, (base.relativeDrag ?? 1) - 1.05) * 250) +
      Math.min(25, Math.max(0, (wearTrend ?? 0) - 0.04) * 200);
    const score = Math.max(0, Math.round(100 - penalty));
    return { ...base, score, status: statusFor(score, enoughData), advice: adviceFor(base, enoughData) };
  });

  const rated = faces.filter((f) => f.status !== "unknown");
  const overallScore = rated.length
    ? Math.round(rated.reduce((sum, f) => sum + f.score * f.turns, 0) / rated.reduce((sum, f) => sum + f.turns, 0))
    : 100;
  const worst = [...rated].sort((a, b) => a.score - b.score)[0];
  const headline =
    !worst
      ? "Keep solving — each face needs a few dozen turns before it can be judged."
      : worst.status === "healthy"
        ? "Your cube is in great shape — every face is turning cleanly."
        : `Your ${worst.color.toLowerCase()} face needs attention first.`;

  return {
    solvesAnalyzed: solves.length,
    turnsAnalyzed: all.length,
    faces,
    overallScore,
    headline,
    peakTps: peakBurstTps(solves),
  };
}
