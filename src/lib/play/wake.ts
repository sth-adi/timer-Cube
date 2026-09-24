/**
 * Wake Solve: the alarm that only stops once you've scrambled and solved
 * your cube. Pure helpers — when it next rings, and a random scramble in
 * the solver's own grip — so the page is just clock, sound and screens.
 */

const FACES = ["R", "L", "U", "D", "F", "B"] as const;
const AXIS: Record<string, number> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
const SUFFIXES = ["", "'", "2"] as const;

/** A random-move scramble: no face twice in a row, no three turns on one axis in a row. */
export function wakeScramble(length: number, random: () => number = Math.random): string[] {
  const out: string[] = [];
  while (out.length < length) {
    const face = FACES[Math.floor(random() * FACES.length)];
    const prev = out[out.length - 1]?.[0];
    const prev2 = out[out.length - 2]?.[0];
    if (face === prev) continue;
    if (prev && prev2 && AXIS[face] === AXIS[prev] && AXIS[face] === AXIS[prev2]) continue;
    out.push(face + SUFFIXES[Math.floor(random() * SUFFIXES.length)]);
  }
  return out;
}

/** The next moment the clock reads hh:mm, strictly after `now`. */
export function nextRing(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** "7h 05m", "12m 30s", "9s". */
export function untilLabel(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Alarm loudness 0..1 after ringing for `ms`: starts gentle, full after 90 seconds. */
export function alarmVolume(ms: number): number {
  return Math.min(1, 0.08 + (ms / 90_000) * 0.92);
}
