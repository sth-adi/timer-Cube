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
