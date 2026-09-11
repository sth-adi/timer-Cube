/**
 * Pure date-key and streak logic for the Daily Challenge — kept separate
 * from the store so it's testable without touching zustand or the cube
 * engine worker. A "day" is the device's local calendar day, matching
 * DailyGoalRing's own todayKey() convention elsewhere in the app.
 */

export function dateKeyFor(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function todayDateKey(now = new Date()): string {
  return dateKeyFor(now);
}

export function yesterdayDateKey(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dateKeyFor(d);
}

/**
 * The streak after completing today's challenge. Continues an unbroken run
 * (completed yesterday -> +1), starts fresh otherwise (a gap of 2+ days, or
 * this being the very first completion), and is a no-op if today was
 * already marked complete (so a caller can safely call this more than once
 * for the same completion without inflating the count).
 */
export function nextStreak(
  lastCompletedDateKey: string | null,
  prevStreak: number,
  today = todayDateKey(),
  yesterday = yesterdayDateKey(),
): number {
  if (lastCompletedDateKey === today) return prevStreak;
  if (lastCompletedDateKey === yesterday) return prevStreak + 1;
  return 1;
}
