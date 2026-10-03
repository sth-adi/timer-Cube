const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Coarse "how long ago" label: "just now" under a minute, then "2 min ago", "3 h ago", "2 d ago".
 * Takes `now` explicitly so callers stay pure (no clock read in here, none during render).
 */
export function formatRelativeTime(then: number, now: number): string {
  const diff = now - then;
  if (!(diff >= MIN)) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  return `${Math.floor(diff / DAY)} d ago`;
}
