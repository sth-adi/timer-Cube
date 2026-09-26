import { findingsForPhase, type Finding, type PhaseAnalysis } from "@/lib/analysis/analyze";

/**
 * Director's Cut: the replay narrated. Each phase gets a cue at the move it
 * starts on — what it took (time when the solve was captured live, turns
 * always) and the one thing the analysis says about it — and the replay
 * holds on each cue while it's read out, so the commentary lands on the
 * moment it's about instead of scrolling past underneath.
 */

export interface Cue {
  /** Index into the solve's moves at which this cue fires (when that move is reached). */
  moveIndex: number;
  /** Short on-screen caption title. */
  title: string;
  /** What's spoken (and shown under the title). */
  line: string;
  tone: "good" | "bad" | "neutral";
}

const secs = (ms: number) => {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
};

/** Commentary for a phase with nothing specific flagged. */
function neutralLine(p: PhaseAnalysis): string {
  if (p.model === null || p.lost === null) return "";
  if (p.lost === 0) return "As short as it gets.";
  if (p.lost <= 2) return `Within ${p.lost} of the shortest.`;
  return `${p.lost} turns longer than the shortest way.`;
}

/** A finding's title, as a spoken sentence. */
const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

export function buildDirectorsCut(phases: readonly PhaseAnalysis[], findings: readonly Finding[], timestamps?: readonly number[] | null, totalMs?: number): Cue[] {
  const cues: Cue[] = [];
  const moveCount = phases.reduce((n, p) => n + p.moves.length, 0);
  const timed = !!timestamps && timestamps.length === moveCount;
  let start = 0;
  for (const p of phases) {
    const n = p.moves.length;
    if (n === 0) {
      start += n;
      continue;
    }
    const name = p.slot ? `${p.label} ${p.slot}` : p.label;
    // Phase time runs from the last turn of the previous phase to this phase's last turn, so recognition counts.
    const ms = timed ? timestamps![start + n - 1] - (start > 0 ? timestamps![start - 1] : 0) : null;
    const stat = ms !== null ? `${secs(ms)} seconds, ${n} turn${n === 1 ? "" : "s"}.` : `${n} turn${n === 1 ? "" : "s"}.`;
    const top = findingsForPhase(p, findings)[0];
    const comment = top ? sentence(top.title) : neutralLine(p);
    const tone: Cue["tone"] = top ? (top.severity === "good" ? "good" : top.severity === "low" ? "neutral" : "bad") : p.lost === 0 ? "good" : "neutral";
    const caseBit = p.caseName ? ` ${p.caseName}.` : "";
    cues.push({ moveIndex: start, title: name, line: `${name}.${caseBit} ${stat} ${comment}`.replace(/\s+/g, " ").trim(), tone });
    start += n;
  }
  if (cues.length && moveCount > 0) {
    const total = totalMs ?? (timed ? timestamps![moveCount - 1] : null);
    // The take to redo: a flagged phase first (high over medium), then the most turns over the shortest.
    const weight = (p: PhaseAnalysis) => {
      const sev = findingsForPhase(p, findings)[0]?.severity;
      return (sev === "high" ? 100 : sev === "medium" ? 50 : 0) + (p.lost ?? 0);
    };
    const worst = phases.filter((p) => p.moves.length > 0 && weight(p) > 0).sort((a, b) => weight(b) - weight(a))[0];
    const wrap = worst ? ` The take to redo: ${worst.slot ? `${worst.label} ${worst.slot}` : worst.label}.` : " Clean all the way through.";
    cues.push({
      moveIndex: moveCount - 1,
      title: "That's a wrap",
      line: `${total !== null ? `${secs(total)} seconds` : `${moveCount} turns`}.${wrap}`,
      tone: worst ? "neutral" : "good",
    });
  }
  return cues;
}

/** Rough speaking time for a line, for when speech synthesis isn't available (≈ 2.6 words a second, with a floor). */
export function readingMs(line: string): number {
  const words = line.split(/\s+/).filter(Boolean).length;
  return Math.max(1400, Math.round((words / 2.6) * 1000));
}
