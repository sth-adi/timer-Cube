import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { isPllSkip, recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";

/**
 * Mistake Radar: replays a smart-cube solve move by move against its
 * scramble and flags the moments that cost time — the kind of blunder a
 * cuber half-notices mid-solve and forgets by the next scramble. Everything
 * is judged from the cube's actual state after every single turn, never
 * from move-count heuristics alone, so a flagged mistake is a thing that
 * really happened on the cube.
 *
 * Works off the physical (center-color) move list in this engine's frame:
 * cross on the white U face, last layer on yellow D.
 */

export type MistakeKind = "pair-knocked" | "cross-broken" | "extra-oll-look" | "extra-pll-look" | "wasted-turns";
export type MistakePhase = "Cross" | "F2L" | "OLL" | "PLL";

export interface Mistake {
  kind: MistakeKind;
  phase: MistakePhase;
  /** Ms from solve start when it happened. */
  atMs: number;
  /** Estimated time it cost (ms). */
  costMs: number;
  title: string;
  detail: string;
  /** Index into the move list where it happened. */
  moveIndex: number;
}

export interface MistakeReport {
  mistakes: Mistake[];
  totalCostMs: number;
  /** 0-100: the share of the solve not lost to flagged mistakes. */
  cleanScore: number;
  /** What the solve would have been without them. */
  potentialMs: number;
}

export interface MistakeRadarInput {
  scramble: string;
  /** Physical move tokens, one per move. */
  moves: readonly string[];
  /** Ms from solve start for each move. */
  timesMs: readonly number[];
  totalMs: number;
}

export const KIND_LABEL: Record<MistakeKind, string> = {
  "pair-knocked": "Knocked-out pair",
  "cross-broken": "Broken cross",
  "extra-oll-look": "Extra OLL look",
  "extra-pll-look": "Extra PLL look",
  "wasted-turns": "Wasted turns",
};

/** A solved group has to stay broken for this many moves to count — every ordinary insertion (R U R') briefly lifts a cross edge or a neighbouring pair out and puts it straight back. */
export const BREAK_MIN_MOVES = 7;
/** A pause at least this long (ms) is the cuber stopping to read the cube — a "look". */
export const LOOK_PAUSE_MS = 350;

/** F2L pairs named by their colors rather than a slot position, since "front-right" depends on how the cube is held. */
export const PAIR_NAMES = ["green-red", "green-orange", "blue-orange", "blue-red"] as const;

const CROSS_EDGES = [0, 1, 2, 3];

function crossSolved(cube: CubeJSInstance): boolean {
  return CROSS_EDGES.every((s) => cube.ep[s] === s && cube.eo[s] === 0);
}

interface Snapshot {
  cross: boolean;
  pairs: boolean[];
  f2l: boolean;
  oriented: boolean;
  /** Solved up to a final AUF. */
  permuted: boolean;
  /** The last-layer-on-U library-frame clone, kept only where a case name might be wanted. */
  cube: CubeJSInstance;
}

function snapshot(cube: CubeJSInstance): Snapshot {
  const f2l = bottomLayerSolved(cube);
  const oriented = f2l && orientationSolved(cube);
  const libraryFrame = toLibraryFrame(cube);
  return {
    cross: crossSolved(cube),
    pairs: [0, 1, 2, 3].map((i) => f2lPairSolved(cube, i as 0 | 1 | 2 | 3)),
    f2l,
    oriented,
    permuted: oriented && isPllSkip(libraryFrame),
    cube: libraryFrame,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quarterTurns(token: string): number {
  const suffix = token.slice(1);
  return suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
}

/**
 * Finds stretches where a group that had been solved came apart and stayed
 * apart for at least BREAK_MIN_MOVES moves. `solvedAt[i]` is the group's
 * state after move i. Only states from move `from` on count — a pair that
 * happened to sit solved in the scramble and got scattered while building
 * the cross was never "solved" by the cuber — and breaks are only
 * considered up to move `limit`.
 */
function brokenEpisodes(
  solvedAt: readonly boolean[],
  from: number,
  limit: number,
): { breakAt: number; restoredAt: number | null }[] {
  const out: { breakAt: number; restoredAt: number | null }[] = [];
  let everSolved = false;
  let breakAt: number | null = null;
  for (let i = Math.max(0, from); i < solvedAt.length; i++) {
    if (solvedAt[i]) {
      if (breakAt !== null && i - breakAt >= BREAK_MIN_MOVES) out.push({ breakAt, restoredAt: i });
      breakAt = null;
      everSolved = true;
    } else if (everSolved && breakAt === null && i <= limit) {
      breakAt = i;
    }
  }
  if (breakAt !== null && solvedAt.length - breakAt >= BREAK_MIN_MOVES) out.push({ breakAt, restoredAt: null });
  return out;
}

export function analyzeMistakes({ scramble, moves, timesMs, totalMs }: MistakeRadarInput): MistakeReport {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const snaps: Snapshot[] = [];
  for (const m of moves) {
    cube.move(m);
    snaps.push(snapshot(cube));
  }
  const t = (i: number) => timesMs[i] ?? 0;
  const firstIdx = (pred: (s: Snapshot) => boolean) => snaps.findIndex(pred);
  const crossIdx = firstIdx((s) => s.cross);
  const f2lIdx = firstIdx((s) => s.f2l);
  const ollIdx = f2lIdx >= 0 ? snaps.findIndex((s, i) => i >= f2lIdx && s.oriented) : -1;
  const f2lLimit = f2lIdx >= 0 ? f2lIdx : snaps.length - 1;
  const gaps = timesMs.slice(1).map((v, i) => v - timesMs[i]);
  const typicalGap = median(gaps.filter((g) => g < LOOK_PAUSE_MS)) || 150;

  const phaseAt = (i: number): MistakePhase =>
    crossIdx < 0 || i <= crossIdx ? "Cross" : f2lIdx < 0 || i <= f2lIdx ? "F2L" : ollIdx < 0 || i <= ollIdx ? "OLL" : "PLL";

  const mistakes: Mistake[] = [];

  // 1. F2L pairs knocked back out after being solved (during F2L only —
  //    OLL/PLL algorithms legitimately take pairs apart and restore them).
  for (let p = 0; p < 4; p++) {
    if (crossIdx < 0) break;
    for (const ep of brokenEpisodes(
      snaps.map((s) => s.pairs[p]),
      crossIdx,
      f2lLimit,
    )) {
      const end = ep.restoredAt ?? snaps.length - 1;
      mistakes.push({
        kind: "pair-knocked",
        phase: "F2L",
        atMs: t(ep.breakAt),
        costMs: Math.max(0, t(end) - t(ep.breakAt)),
        moveIndex: ep.breakAt,
        title: `Knocked out the ${PAIR_NAMES[p]} pair`,
        detail:
          ep.restoredAt === null
            ? `${moves[ep.breakAt]} took an already-solved pair apart and it was never rebuilt.`
            : `${moves[ep.breakAt]} took an already-solved pair apart; rebuilding it took ${ep.restoredAt - ep.breakAt} moves.`,
      });
    }
  }

  // 2. The cross broken mid-F2L and not immediately restored.
  if (crossIdx >= 0) {
    for (const ep of brokenEpisodes(
      snaps.map((s) => s.cross),
      crossIdx,
      f2lLimit,
    )) {
      const end = ep.restoredAt ?? snaps.length - 1;
      mistakes.push({
        kind: "cross-broken",
        phase: phaseAt(ep.breakAt),
        atMs: t(ep.breakAt),
        costMs: Math.max(0, t(end) - t(ep.breakAt)),
        moveIndex: ep.breakAt,
        title: "Broke the cross",
        detail: `${moves[ep.breakAt]} displaced a cross edge that stayed out for ${end - ep.breakAt} moves.`,
      });
    }
  }

  // 3/4. Extra looks: a pause to read the cube while it sits at an
  // intermediate last-layer state — i.e. the first algorithm didn't finish
  // the step, and another look (recognition + algorithm) was needed.
  // Stretches of pure D turns (AUF, in this frame) don't create a new look.
  const extraLooks = (from: number, to: number, isLookState: (s: Snapshot) => boolean) => {
    const looks: number[] = [];
    let lastLook = from;
    for (let i = from + 1; i < to; i++) {
      if (!isLookState(snaps[i])) continue;
      const pauseAfter = i + 1 < timesMs.length ? t(i + 1) - t(i) : 0;
      if (pauseAfter < LOOK_PAUSE_MS) continue;
      const sinceLast = moves.slice(lastLook + 1, i + 1);
      if (sinceLast.every((m) => m[0] === "D")) continue;
      looks.push(i);
      lastLook = i;
    }
    return looks;
  };

  if (f2lIdx >= 0 && ollIdx > f2lIdx) {
    for (const i of extraLooks(f2lIdx, ollIdx, (s) => s.f2l && !s.oriented)) {
      const name = recognizeOll(snaps[i].cube)?.case.name;
      mistakes.push({
        kind: "extra-oll-look",
        phase: "OLL",
        atMs: t(i),
        costMs: Math.max(0, t(ollIdx) - t(i)),
        moveIndex: i,
        title: "Extra OLL look",
        detail: `Your first algorithm left the last layer unoriented${name ? ` (${name})` : ""}, so OLL took another look to finish.`,
      });
    }
  }
  if (ollIdx >= 0) {
    const endIdx = snaps.length;
    for (const i of extraLooks(ollIdx, endIdx, (s) => s.oriented && !s.permuted)) {
      const name = recognizePll(snaps[i].cube)?.case.name;
      mistakes.push({
        kind: "extra-pll-look",
        phase: "PLL",
        atMs: t(i),
        costMs: Math.max(0, t(snaps.length - 1) - t(i)),
        moveIndex: i,
        title: "Extra PLL look",
        detail: `Your first algorithm didn't finish the permutation${name ? ` — it left ${name}` : ""}, so PLL took another look.`,
      });
    }
  }

  // 5. Wasted turns: a run of turns on the same face that does less than it
  //    took. Smart cubes report a half turn as two quarter turns (R R), and
  //    stored reconstructions keep them that way, so an identical pair of
  //    quarter turns is just how a half turn is done — not a mistake. What
  //    is: a run that cancels (R R'), or overshoots and comes back (R R2,
  //    R R R).
  for (let start = 0; start < moves.length; ) {
    let end = start;
    while (end + 1 < moves.length && moves[end + 1][0] === moves[start][0]) end++;
    const run = moves.slice(start, end + 1);
    const first = start;
    start = end + 1;
    if (run.length < 2) continue;
    const halfTurnFlicks = run.length === 2 && run[0] === run[1] && !run[0].includes("2");
    if (halfTurnFlicks) continue;
    const net = run.reduce((s, m) => s + quarterTurns(m), 0) % 4;
    const cancelled = net === 0;
    const minimal = cancelled ? 0 : net === 2 && run.every((m) => !m.includes("2")) ? 2 : 1;
    const extra = run.length - minimal;
    if (extra <= 0) continue;
    const face = run[0][0];
    const target = net === 1 ? face : net === 2 ? `${face}2` : `${face}'`;
    mistakes.push({
      kind: "wasted-turns",
      phase: phaseAt(end),
      atMs: t(first),
      costMs: cancelled ? t(end) - t(first) + typicalGap : extra * typicalGap,
      moveIndex: first,
      title: cancelled ? "Turn undone" : "Turn could have been one",
      detail: cancelled ? `${run.join(" ")} cancel out — ${run.length} moves that did nothing.` : `${run.join(" ")} is just ${target} done in ${run.length}.`,
    });
  }

  mistakes.sort((a, b) => a.atMs - b.atMs);
  const totalCostMs = Math.min(
    totalMs,
    mistakes.reduce((sum, m) => sum + m.costMs, 0),
  );
  return {
    mistakes,
    totalCostMs,
    cleanScore: totalMs > 0 ? Math.round(100 * (1 - totalCostMs / totalMs)) : 100,
    potentialMs: Math.max(0, totalMs - totalCostMs),
  };
}

export interface MistakeHabit {
  kind: MistakeKind;
  label: string;
  /** Solves (of those analyzed) with at least one of these. */
  solvesAffected: number;
  occurrences: number;
  totalCostMs: number;
  /** Mean cost per analyzed solve — the fair "what's this habit costing me" number. */
  costPerSolveMs: number;
}

/** Rolls many solves' reports into habits, most expensive first. */
export function aggregateMistakes(reports: readonly MistakeReport[]): MistakeHabit[] {
  const by = new Map<MistakeKind, MistakeHabit>();
  for (const report of reports) {
    const seen = new Set<MistakeKind>();
    for (const m of report.mistakes) {
      const h = by.get(m.kind) ?? {
        kind: m.kind,
        label: KIND_LABEL[m.kind],
        solvesAffected: 0,
        occurrences: 0,
        totalCostMs: 0,
        costPerSolveMs: 0,
      };
      h.occurrences += 1;
      h.totalCostMs += m.costMs;
      if (!seen.has(m.kind)) {
        h.solvesAffected += 1;
        seen.add(m.kind);
      }
      by.set(m.kind, h);
    }
  }
  const n = Math.max(1, reports.length);
  return [...by.values()]
    .map((h) => ({ ...h, costPerSolveMs: h.totalCostMs / n }))
    .sort((a, b) => b.totalCostMs - a.totalCostMs);
}
