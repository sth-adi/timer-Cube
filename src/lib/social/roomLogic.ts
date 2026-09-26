/**
 * Scoring for multiplayer race rooms — pure, so the host's bookkeeping is
 * testable and every client can derive the same standings from the same
 * shared history.
 *
 * Free-for-all: everyone races every round; places score N, N-1, … 1 for
 * finishers (ties share a place), 0 for a DNF.
 * Bracket: single elimination, two racers per heat on the same scramble,
 * byes for a field that isn't a power of two.
 */

export interface RoundResult {
  id: string;
  /** Null = DNF. */
  timeMs: number | null;
}

export interface Placing extends RoundResult {
  place: number;
  points: number;
}

export function rankRound(results: readonly RoundResult[]): Placing[] {
  const n = results.length;
  const sorted = [...results].sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || a.id.localeCompare(b.id));
  const finishers = sorted.filter((r) => r.timeMs !== null).length;
  let place = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (r.timeMs === null) return { ...r, place: finishers + 1, points: 0 };
    if (r.timeMs !== prev) place = i + 1;
    prev = r.timeMs;
    return { ...r, place, points: n - place + 1 };
  });
}

export interface Standing {
  id: string;
  points: number;
  wins: number;
  rounds: number;
  best: number | null;
  mean: number | null;
}

/** Overall table across every finished round, most points first (best single breaks ties). */
export function standings(history: readonly (readonly RoundResult[])[]): Standing[] {
  const table = new Map<string, Standing & { sum: number; finishes: number }>();
  for (const round of history) {
    for (const p of rankRound(round)) {
      const s = table.get(p.id) ?? { id: p.id, points: 0, wins: 0, rounds: 0, best: null, mean: null, sum: 0, finishes: 0 };
      s.points += p.points;
      s.rounds++;
      if (p.place === 1 && p.timeMs !== null) s.wins++;
      if (p.timeMs !== null) {
        s.best = s.best === null ? p.timeMs : Math.min(s.best, p.timeMs);
        s.sum += p.timeMs;
        s.finishes++;
      }
      table.set(p.id, s);
    }
  }
  return [...table.values()]
    .map(({ sum, finishes, ...s }) => ({ ...s, mean: finishes ? sum / finishes : null }))
    .sort((a, b) => b.points - a.points || (a.best ?? Infinity) - (b.best ?? Infinity) || a.id.localeCompare(b.id));
}

export interface Match {
  id: string;
  round: number;
  slot: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  /** Decided without racing (one side empty). */
  bye: boolean;
}

export interface Bracket {
  rounds: Match[][];
}

const matchId = (round: number, slot: number) => `r${round}m${slot}`;

function clone(b: Bracket): Bracket {
  return { rounds: b.rounds.map((r) => r.map((m) => ({ ...m }))) };
}

function propagate(b: Bracket, round: number, slot: number, winner: string | null) {
  const next = b.rounds[round + 1]?.[Math.floor(slot / 2)];
  if (!next) return;
  if (slot % 2 === 0) next.a = winner;
  else next.b = winner;
}

/** Top seed meets bottom seed; seeds past the field are byes, which advance at once. */
export function buildBracket(ids: readonly string[]): Bracket {
  let size = 2;
  while (size < ids.length) size *= 2;
  const rounds: Match[][] = [];
  for (let r = 0, n = size / 2; n >= 1; r++, n /= 2) {
    rounds.push(Array.from({ length: n }, (_, slot) => ({ id: matchId(r, slot), round: r, slot, a: null, b: null, winner: null, bye: false })));
  }
  const b: Bracket = { rounds };
  rounds[0].forEach((m, i) => {
    m.a = ids[i] ?? null;
    m.b = ids[size - 1 - i] ?? null;
  });
  for (const m of rounds[0]) {
    if ((m.a === null) !== (m.b === null)) {
      m.winner = m.a ?? m.b;
      m.bye = true;
      propagate(b, 0, m.slot, m.winner);
    }
  }
  return b;
}

export function recordMatch(bracket: Bracket, id: string, winner: string): Bracket {
  const b = clone(bracket);
  for (const round of b.rounds) {
    const m = round.find((x) => x.id === id);
    if (!m || m.winner || (winner !== m.a && winner !== m.b)) continue;
    m.winner = winner;
    propagate(b, m.round, m.slot, winner);
  }
  return b;
}

/** The next heat that's ready to race: both sides known, not yet decided. */
export function nextMatch(b: Bracket): Match | null {
  for (const round of b.rounds) for (const m of round) if (m.a && m.b && !m.winner) return m;
  return null;
}

export function champion(b: Bracket): string | null {
  return b.rounds[b.rounds.length - 1]?.[0]?.winner ?? null;
}

/** Who won a two-way heat: the faster finisher; a DNF loses; two DNFs go to the higher seed (`a`). */
export function heatWinner(m: Pick<Match, "a" | "b">, results: Record<string, number | null>): string | null {
  if (!m.a || !m.b) return m.a ?? m.b;
  const ta = results[m.a] ?? null;
  const tb = results[m.b] ?? null;
  if (ta === null && tb === null) return m.a;
  if (tb === null) return m.a;
  if (ta === null) return m.b;
  return tb < ta ? m.b : m.a;
}

/** Room host: whoever's been in the room longest (id breaks an exact tie), so every client agrees without a vote. */
export function pickHost<T extends { id: string; joinedAt: number }>(members: readonly T[]): string | null {
  let best: T | null = null;
  for (const m of members) if (!best || m.joinedAt < best.joinedAt || (m.joinedAt === best.joinedAt && m.id < best.id)) best = m;
  return best?.id ?? null;
}
