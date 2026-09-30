import { averageOfN } from "./stats";

/**
 * What the next solve has to be to set a new personal best. "Best" here is
 * whatever the app already means by it everywhere else — the best single and
 * the best rolling ao5 / ao12 of the session — and the averages use the same
 * WCA rule the rest of the app does (drop best and worst, DNFs count as
 * infinity), so a target met here is a record in the stats panel too.
 */

/** Anything slower than this counts as "any time works" when searching for the threshold. */
const SEARCH_CEILING_MS = 1_000_000;

const avgOf = (times: readonly number[]): number => averageOfN([...times]).value ?? Infinity;

/**
 * The slowest next solve (whole ms) that still brings the ao-n under
 * `target`, given the n-1 solves before it. `null`: even a 0.00 wouldn't.
 * `"any"`: nothing you could plausibly do misses it. The average only ever
 * rises with the new time, so this is a plain search for the tipping point.
 */
export function slowestToBeat(previous: readonly number[], n: number, target: number): number | "any" | null {
  if (previous.length !== n - 1) return null;
  const beats = (x: number) => avgOf([...previous, x]) < target;
  if (!beats(0)) return null;
  if (beats(SEARCH_CEILING_MS)) return "any";
  let lo = 0; // beats
  let hi = SEARCH_CEILING_MS; // doesn't
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (beats(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface AverageTarget {
  n: 5 | 12;
  /** Your ao-n right now (null until you have n solves, or while it's a DNF). */
  current: number | null;
  /** Your best ao-n. */
  best: number;
  /** The slowest next solve that sets a new best — see slowestToBeat. */
  need: number | "any" | null;
}

export interface PbTargets {
  /** Beat this to set a new best single. */
  single: number | null;
  averages: AverageTarget[];
}

/** `times`: the session's comparable times, oldest first (DNF = Infinity). */
export function pbTargets(times: readonly number[]): PbTargets {
  const finite = times.filter((t) => Number.isFinite(t));
  const single = finite.length > 0 ? Math.min(...finite) : null;
  const averages: AverageTarget[] = [];
  for (const n of [5, 12] as const) {
    if (times.length < n) continue;
    let best = Infinity;
    for (let end = n; end <= times.length; end++) best = Math.min(best, avgOf(times.slice(end - n, end)));
    if (!Number.isFinite(best)) continue;
    const current = avgOf(times.slice(-n));
    averages.push({ n, current: Number.isFinite(current) ? current : null, best, need: slowestToBeat(times.slice(-(n - 1)), n, best) });
  }
  return { single, averages };
}
