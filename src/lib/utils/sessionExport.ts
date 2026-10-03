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
  /**
   * Every stored Solve field except `sessionId` (the import picks the session),
   * so an export imports back losslessly. `id` and `updatedAt` let a second
   * import of the same file recognise the solves already here (see
   * importSolves); files from before they were written simply lack them.
   */
  solves: Array<{
    id?: string;
    updatedAt?: number;
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
    rotations?: { atMs: number; token: string }[];
    orientedReconstruction?: string;
    gyroStream?: Solve["gyroStream"];
    cube?: Solve["cube"];
    repaired?: Solve["repaired"];
  }>;
}

export function buildSessionExport(sessionName: string, solves: Solve[]): SessionExport {
  return {
    version: 1,
    exportedAt: Date.now(),
    sessionName,
    solves: solves.map((s) => ({
      id: s.id,
      updatedAt: s.updatedAt,
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
      rotations: s.rotations,
      orientedReconstruction: s.orientedReconstruction,
      gyroStream: s.gyroStream,
      cube: s.cube,
      repaired: s.repaired,
    })),
  };
}

/** Saves `data` as a JSON file. Written compact — no indentation — since a smart-cube history runs to megabytes. */
export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data)], { type: "application/json" }));
}

export function downloadBlob(filename: string, blob: Blob): void {
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

function isCubeRef(v: unknown): v is NonNullable<Solve["cube"]> {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.name === "string" && (c.protocol === undefined || typeof c.protocol === "string") && (c.corrected === undefined || typeof c.corrected === "boolean");
}

function isRepair(v: unknown): v is NonNullable<Solve["repaired"]> {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (r.kind === "inserted" || r.kind === "removed") && typeof r.index === "number" && Array.isArray(r.tokens) && r.tokens.every((t) => typeof t === "string");
}

function isRotationList(v: unknown): v is { atMs: number; token: string }[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as { atMs?: unknown }).atMs === "number" &&
        typeof (r as { token?: unknown }).token === "string",
    )
  );
}

const isFiniteNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));

function isGyroStream(v: unknown): v is NonNullable<Solve["gyroStream"]> {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  const cols = [g.atMs, g.qx, g.qy, g.qz, g.qw];
  return cols.every(isFiniteNumberList) && cols.every((c) => (c as number[]).length === (g.atMs as number[]).length);
}

/** One line for the UI: "Imported 40 solves, skipped 560 already here." */
export function describeImport(r: { added: number; updated: number; skipped: number }, from = ""): string {
  const plural = (n: number) => `${n} solve${n === 1 ? "" : "s"}`;
  const parts = [`Imported ${plural(r.added)}${from ? ` ${from}` : ""}`];
  if (r.updated) parts.push(`updated ${r.updated}`);
  if (r.skipped) parts.push(`skipped ${r.skipped} already here`);
  return `${parts.join(", ")}.`;
}

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
      id: typeof s.id === "string" && s.id.length > 0 ? s.id : undefined,
      updatedAt: typeof s.updatedAt === "number" && Number.isFinite(s.updatedAt) ? s.updatedAt : undefined,
      timeMs: s.timeMs,
      penalty,
      scramble: typeof s.scramble === "string" ? s.scramble : "",
      date: typeof s.date === "number" ? s.date : Date.now(),
      comment: typeof s.comment === "string" ? s.comment : undefined,
      // Older exports predate phase splits, and a hand-edited file can carry
      // anything, so only a clean array of finite numbers is taken.
      splits: isFiniteNumberList(s.splits) ? s.splits : undefined,
      event: VALID_EVENT_TAGS.includes(s.event as EventTag) ? (s.event as EventTag) : undefined,
      reconstruction: typeof s.reconstruction === "string" ? s.reconstruction : undefined,
      heartRate: isHeartRate(s.heartRate) ? s.heartRate : undefined,
      crossMs: typeof s.crossMs === "number" && Number.isFinite(s.crossMs) ? s.crossMs : undefined,
      moveTimestamps: isFiniteNumberList(s.moveTimestamps) ? s.moveTimestamps : undefined,
      rotations: isRotationList(s.rotations) ? s.rotations : undefined,
      orientedReconstruction: typeof s.orientedReconstruction === "string" ? s.orientedReconstruction : undefined,
      gyroStream: isGyroStream(s.gyroStream) ? s.gyroStream : undefined,
      cube: isCubeRef(s.cube) ? s.cube : undefined,
      repaired: isRepair(s.repaired) ? s.repaired : undefined,
    };
  });
}
