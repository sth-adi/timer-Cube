import type { Solve } from "@/types";
import { PHASES, metricsFor, quantile, type PhaseName } from "@/lib/analytics/solveMetrics";
import { computeDnaAxes, type DnaAxis } from "@/lib/stats/dna";
import { traitOf } from "@/lib/stats/dnaTimeline";
import { currentLevelMs } from "@/lib/journey/journey";
import { solveFinalMs } from "@/types";

/**
 * DNA Duel: your Cube DNA and your real numbers packed into a link a friend
 * can open — no account, no server, the card is the link. Opening one puts
 * the two fingerprints on the same radar and the numbers side by side:
 * where they're faster, by how much, what that's worth, and which drills
 * close that gap (and where you're the one to learn from).
 */

export interface DuelCard {
  v: 1;
  name: string;
  /** When the card was made. */
  at: number;
  count: number;
  /** Trimmed mean of the last 50 solves. */
  averageMs: number;
  bestMs: number | null;
  /** Median time per phase from smart-cube solves, when there are enough. */
  phases: Partial<Record<PhaseName, number>>;
  /** Median turns per second while turning, from smart-cube solves. */
  tps: number | null;
  axes: DnaAxis[];
  trait: string;
}

const MIN_METRICS = 10;

export function buildDuelCard(solves: readonly Solve[], name: string, now: number): DuelCard | null {
  const plain = solves.filter((s) => !s.event);
  const averageMs = currentLevelMs(plain);
  if (averageMs === null) return null;
  const finals = plain.map(solveFinalMs).filter((x): x is number => x !== null);
  const metrics = metricsFor(plain);
  const phases: Partial<Record<PhaseName, number>> = {};
  let tps: number | null = null;
  if (metrics.length >= MIN_METRICS) {
    const recent = metrics.slice(-100);
    PHASES.forEach((p, i) => (phases[p] = Math.round(quantile(recent.map((m) => m.phases[i]), 0.5))));
    tps = Math.round(quantile(recent.map((m) => m.execTps), 0.5) * 100) / 100;
  }
  const axes = computeDnaAxes([...plain]).map((a) => ({ label: a.label, score: Math.round(a.score) }));
  return {
    v: 1,
    name: cleanName(name),
    at: now,
    count: plain.length,
    averageMs: Math.round(averageMs),
    bestMs: finals.length ? Math.min(...finals) : null,
    phases,
    tps,
    axes,
    trait: traitOf(axes).name,
  };
}

export function cleanName(name: string): string {
  return name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "A cuber";
}

// ---- The link ----

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Compact wire form: short keys, so the link stays short. */
export function encodeCard(c: DuelCard): string {
  const wire = {
    v: 1,
    n: c.name,
    t: c.at,
    c: c.count,
    a: c.averageMs,
    b: c.bestMs,
    p: PHASES.map((p) => c.phases[p] ?? null),
    s: c.tps,
    x: c.axes.map((a) => [a.label, a.score]),
    r: c.trait,
  };
  return toBase64Url(JSON.stringify(wire));
}

const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

/** Parses a card from its code (or a whole link containing one); null for anything malformed. */
export function decodeCard(input: string): DuelCard | null {
  const code = input.includes("c=") ? input.slice(input.indexOf("c=") + 2).split(/[&\s]/)[0] : input.trim();
  if (!code || code.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  let w: Record<string, unknown>;
  try {
    w = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!w || w.v !== 1) return null;
  const averageMs = num(w.a, 100, 3_600_000);
  const count = num(w.c, 0, 10_000_000);
  const at = num(w.t, 0, 1e14);
  if (averageMs === null || count === null || at === null) return null;
  const phases: Partial<Record<PhaseName, number>> = {};
  if (Array.isArray(w.p)) PHASES.forEach((p, i) => {
    const v = num((w.p as unknown[])[i], 0, 600_000);
    if (v !== null) phases[p] = v;
  });
  const axes: DnaAxis[] = Array.isArray(w.x)
    ? (w.x as unknown[]).flatMap((e) => (Array.isArray(e) && typeof e[0] === "string" && num(e[1], 0, 100) !== null ? [{ label: String(e[0]).slice(0, 16), score: e[1] as number }] : [])).slice(0, 12)
    : [];
  return {
    v: 1,
    name: cleanName(typeof w.n === "string" ? w.n : ""),
    at,
    count,
    averageMs,
    bestMs: num(w.b, 100, 3_600_000),
    phases,
    tps: num(w.s, 0, 30),
    axes,
    trait: typeof w.r === "string" ? w.r.slice(0, 32) : "",
  };
}

// ---- Head to head ----

export interface DuelRow {
  label: string;
  mine: number | null;
  theirs: number | null;
  unit: "s" | "tps" | "solves";
  /** Who's better on this row. */
  edge: "me" | "them" | "even" | null;
}

export interface DuelReport {
  rows: DuelRow[];
  headline: string;
  /** Where they beat you, with what to practise; and where you beat them. */
  steal: string[];
  teach: string[];
}

const PHASE_DRILLS: Record<PhaseName, string> = {
  Cross: "Blind Cross and the X-Cross Hunter",
  F2L: "the F2L Pause Map and Mistake Drills",
  OLL: "the Alg Gym and Alg Speed Check",
  PLL: "the Alg Gym and the AUF Audit",
};

const s2 = (ms: number) => (ms / 1000).toFixed(2);

function edgeOf(mine: number | null, theirs: number | null, lowerIsBetter: boolean, evenWithin: number): DuelRow["edge"] {
  if (mine === null || theirs === null) return null;
  const rel = (theirs - mine) / Math.max(Math.abs(mine), Math.abs(theirs), 1e-9);
  if (Math.abs(rel) < evenWithin) return "even";
  return rel > 0 === lowerIsBetter ? "me" : "them";
}

export function compareCards(me: DuelCard, them: DuelCard): DuelReport {
  const rows: DuelRow[] = [
    { label: "Average", mine: me.averageMs, theirs: them.averageMs, unit: "s", edge: edgeOf(me.averageMs, them.averageMs, true, 0.01) },
    { label: "Best single", mine: me.bestMs, theirs: them.bestMs, unit: "s", edge: edgeOf(me.bestMs, them.bestMs, true, 0.01) },
    ...PHASES.map((p) => ({ label: p, mine: me.phases[p] ?? null, theirs: them.phases[p] ?? null, unit: "s" as const, edge: edgeOf(me.phases[p] ?? null, them.phases[p] ?? null, true, 0.03) })),
    { label: "Turning speed", mine: me.tps, theirs: them.tps, unit: "tps", edge: edgeOf(me.tps, them.tps, false, 0.03) },
    { label: "Solves", mine: me.count, theirs: them.count, unit: "solves", edge: edgeOf(me.count, them.count, false, 0.05) },
  ];

  const gap = me.averageMs - them.averageMs;
  const phaseGaps = PHASES.flatMap((p) => (me.phases[p] !== undefined && them.phases[p] !== undefined ? [{ p, d: me.phases[p]! - them.phases[p]! }] : []));
  const theyWin = phaseGaps.filter((g) => g.d > 0 && g.d / me.phases[g.p]! >= 0.03).sort((a, b) => b.d - a.d);
  const iWin = phaseGaps.filter((g) => g.d < 0 && -g.d / them.phases[g.p]! >= 0.03).sort((a, b) => a.d - b.d);

  let headline: string;
  if (Math.abs(gap) < me.averageMs * 0.01) headline = `Dead even: ${s2(me.averageMs)}s against ${s2(them.averageMs)}s.`;
  else {
    // "x of it" only when the phase gap really is a part of the total; otherwise just name the biggest gap.
    const where = (d: number, p: PhaseName) => (d <= Math.abs(gap) ? ` — ${s2(d)}s of it in ${p}` : ` — the biggest gap is ${p}, ${s2(d)}s`);
    if (gap > 0) headline = `${them.name} is ${s2(gap)}s faster on average${theyWin[0] ? where(theyWin[0].d, theyWin[0].p) : ""}.`;
    else headline = `You're ${s2(-gap)}s faster on average${iWin[0] ? where(-iWin[0].d, iWin[0].p) : ""}.`;
  }

  const steal = theyWin.map((g) => `${g.p}: theirs is ${s2(g.d)}s faster (${s2(them.phases[g.p]!)}s vs your ${s2(me.phases[g.p]!)}s) — ${PHASE_DRILLS[g.p]} close that gap.`);
  if (me.tps !== null && them.tps !== null && them.tps > me.tps * 1.08) steal.push(`They turn at ${them.tps.toFixed(1)} TPS to your ${me.tps.toFixed(1)} — the Tempo Trainer pushes your hands.`);
  const style = alignedStyle(me.axes, them.axes);
  if (style && style.d < -10) steal.push(`Their ${style.label} score is ${-style.d} points higher on the DNA — ${style.label === "Consistency" ? "fewer bad solves, which the Consistency Lab and Tilt Meter work on" : "worth a look at what they do differently"}.`);
  const teach = iWin.map((g) => `${g.p}: yours is ${s2(-g.d)}s faster — you've got something to show them.`);
  if (!phaseGaps.length) steal.push("Phase-by-phase comparison needs smart-cube solves on both cards.");
  return { rows, headline, steal, teach };
}

/** The DNA axis with the widest gap between the two (mine − theirs), among the ones both cards have. */
function alignedStyle(a: readonly DnaAxis[], b: readonly DnaAxis[]): { label: string; d: number } | null {
  const shared = a.flatMap((x) => {
    const y = b.find((z) => z.label === x.label);
    return y && x.label !== "Volume" ? [{ label: x.label, d: x.score - y.score }] : [];
  });
  return shared.sort((p, q) => p.d - q.d)[0] ?? null;
}
