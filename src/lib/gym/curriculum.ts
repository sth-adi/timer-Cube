import type { AlgSpeedReport } from "@/lib/analysis/algSpeed";
import type { CaseOccurrence } from "@/lib/analysis/caseHistory";
import type { F2lConsistencyReport } from "@/lib/analysis/f2lConsistency";
import type { LookaheadReport } from "@/lib/analysis/lookahead";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { caseKey, type GymCaseStats, type GymGroup } from "./algGym";

/**
 * The adaptive curriculum: one practice session planned across every
 * trainer, sized by where your solves actually lose time. Each skill gets
 * a price in ms per solve (measured against your own better solves), the
 * costliest few become blocks, and the session's minutes are shared out in
 * proportion — so a PLL you execute slowly, an OLL you're slow to spot, an
 * inconsistent F2L case and a slow cross all compete for the same time.
 */

export type BlockKind = "gym" | "recognize" | "f2l" | "cross" | "lookahead";

export interface CaseRef {
  group: GymGroup;
  name: string;
}

export interface Block {
  id: string;
  kind: BlockKind;
  title: string;
  /** Why this block, in one line — the evidence. */
  reason: string;
  msPerSolve: number;
  minutes: number;
  /** Gym and Recognize blocks: the cases to drill. */
  cases?: CaseRef[];
  /** Gym blocks: target reps (a rep is roughly 20 seconds with setup). */
  reps?: number;
}

export interface CurriculumInput {
  alg: AlgSpeedReport | null;
  occurrences: readonly CaseOccurrence[];
  solves: number;
  f2l: F2lConsistencyReport | null;
  look: LookaheadReport | null;
  metrics: readonly SolveMetrics[];
  gym: Record<string, GymCaseStats>;
  minutes: number;
}

const MAX_BLOCKS = 4;
const MIN_BLOCK_MIN = 2;
const REPS_PER_MIN = 3;
/** What a botched last-layer algorithm costs to recover from mid-solve, roughly. */
const BOTCH_MS = 3000;
const s = (ms: number) => (ms / 1000).toFixed(2);
const list = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));

function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
}

/** Every block worth doing, priced, costliest first — before the time budget is applied. */
export function candidateBlocks(input: CurriculumInput): Omit<Block, "minutes" | "reps">[] {
  const out: Omit<Block, "minutes" | "reps">[] = [];

  // 1. Last-layer algorithms you execute slowly or in two looks — drilled on the cube.
  const exec = (input.alg?.flagged ?? []).filter((a) => a.verdict !== "fine").slice(0, 5);
  if (exec.length) {
    out.push({
      id: "gym-exec",
      kind: "gym",
      title: `Drill ${list(exec.slice(0, 3).map((a) => a.name))} on your cube`,
      reason: `In your solves these ${exec.some((a) => a.verdict === "two-look") ? "take two looks or stall" : "run slower than the rest of your last layer"}.`,
      msPerSolve: exec.reduce((a, x) => a + x.lostMsPerSolve, 0),
      cases: exec.map((a) => ({ group: a.group, name: a.name })),
    });
  }

  // 2. Cases you're slow to recognize — flashcards.
  if (input.solves > 0) {
    const slow: { ref: CaseRef; lost: number }[] = [];
    for (const group of ["OLL", "PLL"] as const) {
      const byCase = new Map<string, number[]>();
      for (const o of input.occurrences) if (o.group === group) byCase.set(o.name, [...(byCase.get(o.name) ?? []), o.recognitionMs]);
      const means = [...byCase].filter(([, xs]) => xs.length >= 2).map(([name, xs]) => ({ name, n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length }));
      if (means.length < 3) continue;
      const typical = quantile(
        means.map((m) => m.mean),
        0.5,
      );
      for (const m of means) if (m.mean > typical * 1.4) slow.push({ ref: { group, name: m.name }, lost: ((m.mean - typical) * m.n) / input.solves });
    }
    slow.sort((a, b) => b.lost - a.lost);
    if (slow.length) {
      const top = slow.slice(0, 6);
      out.push({
        id: "recognize",
        kind: "recognize",
        title: `Recognize ${list(top.slice(0, 3).map((x) => x.ref.name))} on sight`,
        reason: "You pause noticeably longer before these than before your other cases.",
        msPerSolve: top.reduce((a, x) => a + x.lost, 0),
        cases: top.map((x) => x.ref),
      });
    }
  }

  // 3. Algorithms you know but botch in the gym.
  const shaky = Object.entries(input.gym)
    .filter(([, st]) => st.attempts >= 3 && st.successes / st.attempts < 0.75)
    .map(([key, st]) => {
      const [group, name] = key.split(":") as [GymGroup, string];
      const perSolve = group === "PLL" ? 1 / 21 : 1 / 57;
      return { ref: { group, name }, lost: (1 - st.successes / st.attempts) * BOTCH_MS * perSolve };
    })
    .sort((a, b) => b.lost - a.lost);
  if (shaky.length && !out.some((b) => b.id === "gym-exec" && shaky.every((x) => b.cases?.some((c) => caseKey(c) === caseKey(x.ref))))) {
    const top = shaky.slice(0, 5);
    out.push({
      id: "gym-shaky",
      kind: "gym",
      title: `Make ${list(top.slice(0, 3).map((x) => x.ref.name))} reliable`,
      reason: "You miss these in the gym more than one time in four.",
      msPerSolve: top.reduce((a, x) => a + x.lost, 0),
      cases: top.map((x) => x.ref),
    });
  }

  // 4. F2L cases you solve inconsistently.
  if (input.f2l && input.f2l.worst.length) {
    const top = input.f2l.worst.slice(0, 3);
    out.push({
      id: "f2l",
      kind: "f2l",
      title: "F2L: settle your inconsistent cases",
      reason: `"${top[0].name}" usually takes you ${top[0].medianTurns.toFixed(0)} turns; your best is ${top[0].bestTurns}.`,
      msPerSolve: input.f2l.lostMsPerSolve,
    });
  }

  // 5. Cross: your typical cross against your better quarter.
  const cross = input.metrics.map((m) => m.phases[0]).filter((x) => x > 0);
  if (cross.length >= 10) {
    const gap = quantile(cross, 0.5) - quantile(cross, 0.25);
    if (gap > 0) {
      out.push({
        id: "cross",
        kind: "cross",
        title: "Plan the whole cross in inspection",
        reason: `Your typical cross takes ${s(quantile(cross, 0.5))}s; your better quarter, ${s(quantile(cross, 0.25))}s.`,
        msPerSolve: gap,
      });
    }
  }

  // 6. Lookahead: turning calmly through F2L pays off for you.
  if (input.look?.verdict === "slow-down" && input.look.netGainMs > 0) {
    out.push({
      id: "lookahead",
      kind: "lookahead",
      title: "Lookahead: slow, steady F2L",
      reason: input.look.headline,
      msPerSolve: input.look.netGainMs * input.look.handoffsPerSolve,
    });
  }

  return out.filter((b) => b.msPerSolve > 0).sort((a, b) => b.msPerSolve - a.msPerSolve);
}

/** When there's no history to learn from yet: a balanced starter session. */
function starter(minutes: number): Block[] {
  const third = Math.max(MIN_BLOCK_MIN, Math.round(minutes / 3));
  return [
    { id: "gym-pll", kind: "gym", title: "PLL on your cube", reason: "No solve history yet — start with the step every solve ends on.", msPerSolve: 0, minutes: third, reps: third * REPS_PER_MIN, cases: [] },
    { id: "recognize", kind: "recognize", title: "Recognition flashcards", reason: "Naming a case fast is half of last-layer speed.", msPerSolve: 0, minutes: third },
    { id: "cross", kind: "cross", title: "Cross planning", reason: "Every solve starts with it.", msPerSolve: 0, minutes: Math.max(MIN_BLOCK_MIN, minutes - 2 * third) },
  ];
}

/** The session: the costliest few blocks, with the minutes shared out by what each is worth. */
export function planCurriculum(input: CurriculumInput): Block[] {
  const picked = candidateBlocks(input).slice(0, MAX_BLOCKS);
  if (!picked.length) return starter(input.minutes);
  const total = picked.reduce((a, b) => a + b.msPerSolve, 0);
  const minutes = picked.map((b) => Math.max(MIN_BLOCK_MIN, Math.round((input.minutes * b.msPerSolve) / total)));
  // Trim the biggest blocks until the plan fits the session.
  let over = minutes.reduce((a, b) => a + b, 0) - input.minutes;
  while (over > 0) {
    const i = minutes.indexOf(Math.max(...minutes));
    if (minutes[i] <= MIN_BLOCK_MIN) break;
    minutes[i]--;
    over--;
  }
  return picked.map((b, i) => ({ ...b, minutes: minutes[i], reps: b.kind === "gym" ? minutes[i] * REPS_PER_MIN : undefined }));
}
