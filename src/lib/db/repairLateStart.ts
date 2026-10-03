import type { Solve } from "@/types";

/**
 * Repairs a smart-cube solve saved while the timer wrongly started at the
 * cross instead of the first turn (a regression, since fixed). Such a solve
 * is easy to spot: the turns before the cross were saved with negative
 * times, because they happened before the (late) start. Every time on the
 * solve is shifted back to the real first turn — the result, the splits,
 * the cross time, each turn, the gyro — and nothing else is touched.
 * Returns the changed fields, or null for a solve that's fine.
 */
export function repairLateStart(solve: Solve): Partial<Solve> | null {
  const ts = solve.moveTimestamps;
  if (!ts?.length || !(ts[0] < 0)) return null;
  const offset = -ts[0];
  const shift = (x: number) => x + offset;
  const out: Partial<Solve> = {
    timeMs: solve.timeMs + offset,
    moveTimestamps: ts.map(shift),
  };
  if (solve.crossMs !== undefined) out.crossMs = solve.crossMs + offset;
  if (solve.splits) out.splits = solve.splits.map(shift);
  if (solve.rotations) out.rotations = solve.rotations.map((r) => ({ ...r, atMs: r.atMs + offset }));
  if (solve.gyroStream) out.gyroStream = { ...solve.gyroStream, atMs: solve.gyroStream.atMs.map(shift) };
  return out;
}

const MIGRATION_KEY = "cube-timer:late-start-repair";
/** Bump to run the repair again on every device (e.g. if the bug it fixes ever comes back). */
const MIGRATION_VERSION = "1";

/** True until the one-off late-start repair has been run (and recorded) on this device. */
export function lateStartRepairPending(): boolean {
  try {
    return localStorage.getItem(MIGRATION_KEY) !== MIGRATION_VERSION;
  } catch {
    return true;
  }
}

export function markLateStartRepairDone(): void {
  try {
    localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
  } catch {
    // Not remembered — the (in-memory, cheap) scan just runs again next start.
  }
}
