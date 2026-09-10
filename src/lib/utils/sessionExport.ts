import type { EventTag, Penalty, Solve } from "@/types";

const VALID_EVENT_TAGS: EventTag[] = ["oh", "feet", "bld"];

function isHeartRate(v: unknown): v is { avg: number; max: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).avg === "number" &&
    typeof (v as Record<string, unknown>).max === "number"
  );
}

export interface SessionExport {
  version: 1;
  exportedAt: number;
  sessionName: string;
  solves: Array<{
    timeMs: number;
    penalty: Penalty;
    scramble: string;
    date: number;
    comment?: string;
    splits?: number[];
    event?: EventTag;
    reconstruction?: string;
    heartRate?: { avg: number; max: number };
    crossMs?: number;
    moveTimestamps?: number[];
  }>;
}

export function buildSessionExport(sessionName: string, solves: Solve[]): SessionExport {
  return {
    version: 1,
    exportedAt: Date.now(),
    sessionName,
    solves: solves.map((s) => ({
      timeMs: s.timeMs,
      penalty: s.penalty,
      scramble: s.scramble,
      date: s.date,
      comment: s.comment,
      splits: s.splits,
      event: s.event,
      reconstruction: s.reconstruction,
      heartRate: s.heartRate,
      crossMs: s.crossMs,
      moveTimestamps: s.moveTimestamps,
    })),
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const VALID_PENALTIES: Penalty[] = ["none", "plus2", "dnf"];

/** Validates and normalizes a parsed JSON blob into an import-ready solve list. Throws with a human-readable message on invalid input. */
export function parseSessionExport(raw: unknown): SessionExport["solves"] {
  if (typeof raw !== "object" || raw === null) throw new Error("Not a valid export file");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.solves)) throw new Error("Missing solves array");

  return obj.solves.map((entry, i): SessionExport["solves"][number] => {
    if (typeof entry !== "object" || entry === null) throw new Error(`Solve #${i + 1} is invalid`);
    const s = entry as Record<string, unknown>;
    if (typeof s.timeMs !== "number" || !Number.isFinite(s.timeMs)) {
      throw new Error(`Solve #${i + 1} has an invalid time`);
    }
    const penalty = VALID_PENALTIES.includes(s.penalty as Penalty) ? (s.penalty as Penalty) : "none";
    return {
      timeMs: s.timeMs,
      penalty,
      scramble: typeof s.scramble === "string" ? s.scramble : "",
      date: typeof s.date === "number" ? s.date : Date.now(),
      comment: typeof s.comment === "string" ? s.comment : undefined,
      // Older exports predate phase splits, and a hand-edited file can carry
      // anything, so only a clean array of finite numbers is taken.
      splits:
        Array.isArray(s.splits) && s.splits.every((v) => typeof v === "number" && Number.isFinite(v))
          ? (s.splits as number[])
          : undefined,
      event: VALID_EVENT_TAGS.includes(s.event as EventTag) ? (s.event as EventTag) : undefined,
      reconstruction: typeof s.reconstruction === "string" ? s.reconstruction : undefined,
      heartRate: isHeartRate(s.heartRate) ? s.heartRate : undefined,
      crossMs: typeof s.crossMs === "number" && Number.isFinite(s.crossMs) ? s.crossMs : undefined,
      moveTimestamps:
        Array.isArray(s.moveTimestamps) && s.moveTimestamps.every((v) => typeof v === "number" && Number.isFinite(v))
          ? (s.moveTimestamps as number[])
          : undefined,
    };
  });
}
