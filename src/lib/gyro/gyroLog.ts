import type { GyroSample } from "./orientation";

/** Most samples the armed-to-solved log ever holds (~10 minutes at 50Hz) — memory stays bounded however long a cube sits armed. */
export const GYRO_LOG_CAP = 30000;

/**
 * Adds a sample to the log, thinning instead of stopping when it is full.
 * Dropping new samples at the cap (as a plain `length < cap` check does)
 * loses the solve itself for a cube armed longer than the cap: the log
 * would hold only the idle wait. Instead, at the cap every other sample of
 * the older half is dropped, so the log keeps a uniform, ever-sparser
 * subset of the long wait and everything recent stays at full rate.
 *
 * `protectFromMs` is the solve's start: samples from then on are never
 * thinned (unless there is nothing older to thin), so a long solve keeps
 * its whole stream and lines up with `startedAtMs` exactly. Thinning only
 * ever removes samples, so every kept `atMs` is unchanged. Mutates and
 * returns `log`.
 */
export function appendGyroSample(log: GyroSample[], sample: GyroSample, protectFromMs: number | null = null, cap = GYRO_LOG_CAP): GyroSample[] {
  if (log.length >= cap) thinGyroLog(log, protectFromMs);
  log.push(sample);
  return log;
}

function thinGyroLog(log: GyroSample[], protectFromMs: number | null): void {
  let split = log.length >> 1;
  if (protectFromMs !== null) {
    const firstProtected = log.findIndex((s) => s.atMs >= protectFromMs);
    // Enough older than the solve to thin on its own; otherwise the log is mostly solve, so thin the older half regardless.
    if (firstProtected >= log.length >> 2) split = firstProtected;
  }
  let out = 0;
  for (let i = 0; i < log.length; i++) {
    if (i < split && i % 2 === 1) continue;
    log[out++] = log[i];
  }
  log.length = out;
}
