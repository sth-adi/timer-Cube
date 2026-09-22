/**
 * A written, conversational coaching summary generated from real solve
 * data — not an LLM call (no network dependency, no latency, works
 * offline), but not a single hardcoded template either: it reasons over the
 * actual numbers (this solve vs. your own session average, which phase's
 * recognition pause was the biggest, which phase ran cleanest) the same way
 * a human coach reviewing your solve out loud would, and picks from varied
 * phrasing pools so two similar solves don't read identically.
 *
 * Deliberately generic over its input shape (CoachInput) rather than tied to
 * the smart-cube post-solve table specifically, so the same engine can
 * eventually narrate a regular analyzer result too — see
 * coachInputFromPostSolveRows for the one adapter that exists today.
 */

export interface CoachPhaseStat {
  label: string;
  totalMs: number | null;
  recognitionMs: number | null;
  executionMs: number | null;
}

export interface CoachInput {
  totalMs: number;
  /** Turns per second for the whole solve, if known. */
  tps: number | null;
  /** Ordered phase breakdown — Cross, one row per F2L pair, OLL, PLL, or whatever the caller has. */
  phases: CoachPhaseStat[];
  /** This solver's own session average, for "faster/slower than usual" framing. Null if there isn't a meaningful history yet. */
  sessionMeanMs: number | null;
  isNewPB: boolean;
}

export interface CoachReport {
  headline: string;
  paragraphs: string[];
  /** The one phase worth drilling next, if the data points at one clearly enough. */
  focusPhase: string | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic pick, not Math.random — the same solve always reads the same way (stable across re-renders, and testable), while different solves land on different phrasing. */
function pick<T>(seed: string, options: readonly T[]): T {
  return options[hashString(seed) % options.length];
}

function fmtSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

const PB_HEADLINES = ["New personal best — that's the one.", "PB! That solve just rewrote your record.", "Brand new best single. Nice work."] as const;
const FAST_HEADLINES = ["Well above your usual pace.", "Fast one — clearly on today.", "That was quick, and it shows."] as const;
const SLOW_HEADLINES = ["Slower than your usual pace.", "A rough one, off your normal rhythm.", "Not your smoothest — worth a look."] as const;
const STEADY_HEADLINES = ["A solid, on-pace solve.", "Right around your usual pace.", "A typical solve for you — steady."] as const;
const NO_HISTORY_HEADLINES = ["First real look at this solve.", "Here's how that one broke down."] as const;

const BOTTLENECK_OPENERS = [
  (label: string, ms: number) => `${label} is where the time went — a ${fmtSec(ms)} pause before you started turning.`,
  (label: string, ms: number) => `The biggest gap was recognizing ${label}: ${fmtSec(ms)} of just looking before the first move.`,
  (label: string, ms: number) => `${label}'s recognition took ${fmtSec(ms)} — longer than anywhere else in the solve.`,
] as const;

const BOTTLENECK_ADVICE = [
  (label: string) => `That's a recognition problem, not a turning-speed one — drilling ${label} case ID will pay off faster than practicing execution.`,
  (label: string) => `Since your hands were fine once they started moving, the fix is seeing ${label} faster, not turning it faster.`,
  (label: string) => `Worth flashcard-drilling ${label} recognition specifically — the execution itself was already quick.`,
] as const;

const STRENGTH_LINES = [
  (label: string) => `${label} was clean — barely any hesitation there.`,
  (label: string) => `${label} went by fast with almost no pause before it.`,
  (label: string) => `No complaints about ${label} — that part just happened.`,
] as const;

const TPS_FAST = ["Your turning speed itself was excellent — well above a casual pace.", "The turns themselves were fast — that part of your execution is in good shape."] as const;
const TPS_SLOW = ["Turning speed has room to grow here — the moves themselves, not just recognition, were on the slower side.", "Raw execution speed is the other lever available — the turns were a bit deliberate."] as const;

/**
 * Builds the coaching report. Every sentence is derived from `input` — no
 * hardcoded solve-specific text — so a genuinely different solve produces
 * genuinely different commentary, not just a different number slotted into
 * the same sentence.
 */
export function generateCoachReport(input: CoachInput): CoachReport {
  const { totalMs, tps, phases, sessionMeanMs, isNewPB } = input;
  const seed = `${totalMs}|${phases.map((p) => `${p.label}:${p.totalMs ?? "-"}`).join(",")}`;

  const deltaPct = sessionMeanMs && sessionMeanMs > 0 ? ((sessionMeanMs - totalMs) / sessionMeanMs) * 100 : null;

  let headline: string;
  if (isNewPB) {
    headline = pick(seed, PB_HEADLINES);
  } else if (deltaPct === null) {
    headline = pick(seed, NO_HISTORY_HEADLINES);
  } else if (deltaPct >= 12) {
    headline = pick(seed, FAST_HEADLINES);
  } else if (deltaPct <= -12) {
    headline = pick(seed, SLOW_HEADLINES);
  } else {
    headline = pick(seed, STEADY_HEADLINES);
  }

  const paragraphs: string[] = [];

  if (deltaPct !== null && Math.abs(deltaPct) >= 5) {
    const dir = deltaPct > 0 ? "faster" : "slower";
    paragraphs.push(`This solve was ${Math.abs(Math.round(deltaPct))}% ${dir} than your session average of ${fmtSec(sessionMeanMs!)}.`);
  }

  const knownPhases = phases.filter((p): p is CoachPhaseStat & { totalMs: number } => p.totalMs !== null && p.totalMs > 0);
  const withReco = knownPhases.filter((p) => p.recognitionMs !== null && p.recognitionMs > 150);
  const bottleneck = withReco.length > 0 ? withReco.reduce((a, b) => (b.recognitionMs! > a.recognitionMs! ? b : a)) : null;

  let focusPhase: string | null = null;
  if (bottleneck) {
    focusPhase = bottleneck.label;
    paragraphs.push(pick(seed, BOTTLENECK_OPENERS)(bottleneck.label, bottleneck.recognitionMs!));
    paragraphs.push(pick(seed + "advice", BOTTLENECK_ADVICE)(bottleneck.label));
  }

  const strength = knownPhases
    .filter((p) => p !== bottleneck)
    .reduce<CoachPhaseStat | null>((best, p) => {
      const pReco = p.recognitionMs ?? 0;
      const bestReco = best?.recognitionMs ?? Infinity;
      return best === null || pReco < bestReco ? p : best;
    }, null);
  if (strength && knownPhases.length > 1) {
    paragraphs.push(pick(seed + "strength", STRENGTH_LINES)(strength.label));
  }

  if (tps !== null) {
    if (tps >= 5.5) paragraphs.push(pick(seed + "tps", TPS_FAST));
    else if (tps < 3.5) paragraphs.push(pick(seed + "tps", TPS_SLOW));
  }

  if (paragraphs.length === 0) {
    paragraphs.push("Not enough phase detail on this solve to break down further — the overall time is the whole story here.");
  }

  return { headline, paragraphs, focusPhase };
}

/** Adapter from the smart-cube post-solve table's own row shape into CoachInput — kept separate so generateCoachReport itself never needs to know about PostSolvePhaseRow. */
export function coachInputFromPostSolveRows(
  rows: readonly { label: string; totalMs: number | null; recognitionMs: number | null; executionMs: number | null }[],
  totalMs: number,
  tps: number | null,
  sessionMeanMs: number | null,
  isNewPB: boolean,
): CoachInput {
  return {
    totalMs,
    tps,
    phases: rows.map((r) => ({ label: r.label, totalMs: r.totalMs, recognitionMs: r.recognitionMs, executionMs: r.executionMs })),
    sessionMeanMs,
    isNewPB,
  };
}
