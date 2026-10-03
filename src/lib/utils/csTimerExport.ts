/**
 * Writes sessions in csTimer's own export format, the inverse of csTimerImport.ts (read its header
 * for the shape): `sessionN` arrays of `[[penalty, rawMs], scramble, comment, epochSeconds]`, plus
 * `properties.sessionData` — a JSON string keyed "1", "2", … as csTimer itself writes it — holding
 * each session's name. Penalty is 0, 2000 for +2, or -1 for DNF; the time stays the raw solve time.
 * csTimer keeps whole seconds, so a solve's date is rounded down to the second.
 */

import type { Solve } from "@/types";

export interface CsTimerExportSession {
  name: string;
  solves: Pick<Solve, "timeMs" | "penalty" | "scramble" | "date" | "comment">[];
}

export function buildCsTimerExport(sessions: CsTimerExportSession[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sessionData: Record<string, unknown> = {};

  sessions.forEach((session, i) => {
    const n = i + 1;
    const rows = [...session.solves]
      .sort((a, b) => a.date - b.date)
      .map((s) => [
        [s.penalty === "dnf" ? -1 : s.penalty === "plus2" ? 2000 : 0, s.timeMs],
        s.scramble,
        s.comment ?? "",
        Math.floor(s.date / 1000),
      ]);
    out[`session${n}`] = rows;
    sessionData[String(n)] = { name: session.name, opt: {}, rank: n, stat: [rows.length, 0, 0] };
  });

  out.properties = { sessionData: JSON.stringify(sessionData) };
  return out;
}

export function downloadCsTimerExport(filename: string, sessions: CsTimerExportSession[]): void {
  const blob = new Blob([JSON.stringify(buildCsTimerExport(sessions))], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
