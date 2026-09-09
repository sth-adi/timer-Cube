/**
 * Parses csTimer's export format — the timer most cubers switching to a new
 * app are actually coming from. Its shape is undocumented but stable and
 * well known from the open-source cubing community:
 *
 *   {
 *     "session1": [ [[penalty, rawMs], "scramble", "comment", epochSeconds], ... ],
 *     "session2": [ ... ],
 *     "properties": { "sessionData": "<JSON string of {sessionN: {name, ...}}>" }
 *   }
 *
 * `penalty` is 0 for none, 2000 for +2 (a literal millisecond penalty, not a
 * flag), and -1 or -2 for DNF (both codes appear across csTimer versions).
 * `rawMs` is the solve time in milliseconds, already excluding the penalty —
 * exactly this app's own `timeMs` convention, so no conversion is needed.
 * The trailing timestamp, when present, is Unix seconds.
 */

import type { Penalty } from "@/types";
import type { SessionExport } from "./sessionExport";

export interface CsTimerSessionOption {
  key: string;
  name: string;
  count: number;
}

export interface CsTimerParsed {
  sessions: CsTimerSessionOption[];
  solvesByKey: Record<string, SessionExport["solves"]>;
}

type SolveRow = SessionExport["solves"][number];

function parseCsTimerSolve(entry: unknown): SolveRow | null {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [timePair, scramble, comment, timestamp] = entry as unknown[];
  if (!Array.isArray(timePair) || typeof timePair[1] !== "number" || !Number.isFinite(timePair[1])) return null;

  const [penaltyCode, rawMs] = timePair as [unknown, number];
  const penalty: Penalty =
    penaltyCode === -1 || penaltyCode === -2 ? "dnf" : penaltyCode === 2000 ? "plus2" : "none";

  return {
    timeMs: rawMs,
    penalty,
    scramble: typeof scramble === "string" ? scramble : "",
    date: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp * 1000 : Date.now(),
    comment: typeof comment === "string" && comment.length > 0 ? comment : undefined,
  };
}

/** Cheap shape check, so the import UI can tell this apart from this app's own export format before parsing in earnest. */
export function looksLikeCsTimerExport(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return Object.keys(obj).some((k) => /^session\d+$/.test(k) && Array.isArray(obj[k]));
}

/** Reads csTimer's optional session-name metadata; absent or malformed just means falling back to the raw key. */
function readSessionNames(raw: Record<string, unknown>): Record<string, string> {
  const names: Record<string, string> = {};
  const properties = raw.properties;
  if (typeof properties !== "object" || properties === null) return names;
  const sessionData = (properties as Record<string, unknown>).sessionData;
  if (typeof sessionData !== "string") return names;
  try {
    const parsed = JSON.parse(sessionData) as Record<string, { name?: unknown }>;
    for (const [key, meta] of Object.entries(parsed)) {
      if (meta && typeof meta.name === "string" && meta.name.trim()) names[key] = meta.name;
    }
  } catch {
    // Session names are cosmetic — a malformed metadata blob shouldn't block the import.
  }
  return names;
}

export function parseCsTimerExport(raw: unknown): CsTimerParsed {
  if (typeof raw !== "object" || raw === null) throw new Error("Not a valid csTimer export file");
  const obj = raw as Record<string, unknown>;
  const names = readSessionNames(obj);

  const sessions: CsTimerSessionOption[] = [];
  const solvesByKey: Record<string, SolveRow[]> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!/^session\d+$/.test(key) || !Array.isArray(value)) continue;
    const rows = value.map(parseCsTimerSolve).filter((r): r is SolveRow => r !== null);
    if (rows.length === 0) continue;
    solvesByKey[key] = rows;
    sessions.push({ key, name: names[key] ?? key, count: rows.length });
  }

  if (sessions.length === 0) throw new Error("No solves found in this csTimer export");
  return { sessions, solvesByKey };
}
