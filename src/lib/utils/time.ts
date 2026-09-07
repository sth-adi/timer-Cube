/** Formats milliseconds as WCA-style "M:SS.xx" (or "SS.xx" under a minute). */
export function formatTime(ms: number, precision: 2 | 3 = 2): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const frac = totalMs % 1000;
  const fracStr = precision === 2 ? Math.floor(frac / 10).toString().padStart(2, "0") : frac.toString().padStart(3, "0");
  const secStr = seconds.toString().padStart(minutes > 0 ? 2 : 1, "0");
  return minutes > 0 ? `${minutes}:${secStr}.${fracStr}` : `${secStr}.${fracStr}`;
}

export function formatResult(finalMs: number | null, penalty: "none" | "plus2" | "dnf"): string {
  if (penalty === "dnf") return "DNF";
  if (finalMs === null) return "DNF";
  const base = formatTime(finalMs);
  return penalty === "plus2" ? `${base}+` : base;
}

/**
 * Parses a hand-typed time like "12.34", "1:02.34", "62.5", or "83" (bare
 * seconds) into milliseconds. Returns null if the input isn't a recognizable
 * time. Used for manual time entry (stackmat/phone-timer results).
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const withColon = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (withColon) {
    const minutes = Number(withColon[1]);
    const seconds = Number(withColon[2]);
    const frac = withColon[3] ? Number(withColon[3].padEnd(3, "0")) : 0;
    return minutes * 60000 + seconds * 1000 + frac;
  }

  const plain = /^(\d+)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (plain) {
    const seconds = Number(plain[1]);
    const frac = plain[2] ? Number(plain[2].padEnd(3, "0")) : 0;
    return seconds * 1000 + frac;
  }

  return null;
}
