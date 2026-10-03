import type { Deletion, FullSolve, Penalty, Session, WcaEvent } from "@/types";
import type { SyncState } from "@/lib/db/merge";

/**
 * A full backup of everything this app keeps on the device: every session,
 * solve and deletion record, plus the small settings and progress records
 * (preferences, algorithm review state, learned algorithms, quests…) held in
 * localStorage. One JSON file you can put anywhere.
 *
 * Restoring is a *merge*, not an overwrite — solves go through the same
 * newest-change-wins rule device sync uses (lib/db/merge.ts), so restoring
 * an old backup onto a device that has moved on can't take anything away.
 */

export const BACKUP_APP = "cube-timer-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  sync: SyncState;
  /** localStorage entries worth keeping, key → raw string. */
  storage: Record<string, string>;
}

/**
 * Which localStorage keys belong in a backup: this app's own preferences and
 * progress. Never anything that smells like a credential, and nothing
 * transient (the chunk-reload guard, this module's own bookkeeping).
 */
const INCLUDE = /^(cube-timer-|cube\.|cube-room-|maze-|echo-|golf-|twistris-|wake-)/;
const EXCLUDE = /(auth|token|secret|session-key|supabase|^sb-|cube-timer:|cube-timer-backup)/i;

export function isBackupKey(key: string): boolean {
  return INCLUDE.test(key) && !EXCLUDE.test(key);
}

export function collectStorage(storage: { length: number; key(i: number): string | null; getItem(k: string): string | null }): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !isBackupKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

export function buildBackup(sync: SyncState, storage: Record<string, string>, now: number): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, sync, storage };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const PENALTIES: Penalty[] = ["none", "plus2", "dnf"];

function validSession(v: unknown): v is Session {
  const s = v as Record<string, unknown> | null;
  return !!s && typeof s === "object" && isStr(s.id) && isStr(s.name) && isStr(s.event) && isNum(s.createdAt) && isNum(s.order);
}
function validSolve(v: unknown): v is FullSolve {
  const s = v as Record<string, unknown> | null;
  return !!s && typeof s === "object" && isStr(s.id) && isStr(s.sessionId) && isNum(s.timeMs) && PENALTIES.includes(s.penalty as Penalty) && isStr(s.scramble) && isNum(s.date);
}
function validDeletion(v: unknown): v is Deletion {
  const d = v as Record<string, unknown> | null;
  return !!d && typeof d === "object" && isStr(d.id) && (d.kind === "solve" || d.kind === "session") && isNum(d.deletedAt);
}

export interface ParsedBackup {
  file: BackupFile;
  /** Rows that didn't look like sessions/solves/deletions and were left out. */
  skipped: number;
}

/** Validates a parsed JSON blob as a backup. Throws with a message fit to show. */
export function parseBackup(raw: unknown): ParsedBackup {
  if (typeof raw !== "object" || raw === null) throw new Error("That isn't a backup file.");
  const o = raw as Record<string, unknown>;
  if (o.app !== BACKUP_APP) throw new Error("That isn't a backup made by this app.");
  if (!isNum(o.version) || o.version > BACKUP_VERSION) throw new Error("That backup is from a newer version of the app — update first.");
  const sync = (o.sync ?? {}) as Record<string, unknown>;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const sessions = list(sync.sessions);
  const solves = list(sync.solves);
  const deletions = list(sync.deletions);
  const goodSessions = sessions.filter(validSession);
  const goodSolves = solves.filter(validSolve);
  const goodDeletions = deletions.filter(validDeletion);
  const skipped = sessions.length - goodSessions.length + (solves.length - goodSolves.length) + (deletions.length - goodDeletions.length);
  const storage: Record<string, string> = {};
  if (typeof o.storage === "object" && o.storage !== null) {
    for (const [k, v] of Object.entries(o.storage as Record<string, unknown>)) if (isStr(v) && isBackupKey(k)) storage[k] = v;
  }
  return {
    file: { app: BACKUP_APP, version: o.version, exportedAt: isNum(o.exportedAt) ? o.exportedAt : 0, sync: { sessions: goodSessions, solves: goodSolves, deletions: goodDeletions }, storage },
    skipped,
  };
}

export function backupSummary(file: BackupFile): { solves: number; sessions: number; settings: number } {
  return { solves: file.sync.solves.length, sessions: file.sync.sessions.length, settings: Object.keys(file.storage).length };
}

// --- file encoding ----------------------------------------------------------

/**
 * A backup on disk is the JSON written compact (no indentation — a smart-cube
 * history is mostly number arrays, and pretty-printing them one per line made
 * files several times larger), optionally gzipped. Restore takes either, and
 * still reads the pretty-printed files older versions wrote: whitespace is
 * just JSON.
 */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

/** Whether this browser can write a gzipped backup (CompressionStream: every current browser, but not some older Safari). */
export function canGzip(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

async function pipeBytes(data: BufferSource, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The backup as a file's bytes: plain JSON, or gzip of it when asked (and the browser can). */
export async function encodeBackup(file: BackupFile, opts: { gzip?: boolean } = {}): Promise<{ bytes: Uint8Array<ArrayBuffer>; gzip: boolean }> {
  const json = new TextEncoder().encode(serializeBackup(file));
  if (!opts.gzip || !canGzip()) return { bytes: json, gzip: false };
  return { bytes: await pipeBytes(json, new CompressionStream("gzip")), gzip: true };
}

/** A gzip stream starts 1f 8b, whatever the file happens to be called. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** A backup file's text, un-gzipping it first when its bytes say it's gzip. Throws with a message fit to show. */
export async function decodeBackupBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!isGzip(bytes)) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open compressed backups — try a current Chrome, Firefox or Safari.");
  try {
    return new TextDecoder().decode(await pipeBytes(bytes, new DecompressionStream("gzip")));
  } catch {
    throw new Error("That compressed backup is damaged.");
  }
}

// --- reminders ------------------------------------------------------------

export interface BackupMeta {
  /** When the last backup was downloaded, or null if never. */
  lastAt: number | null;
  /** How many solves there were then. */
  solvesAt: number;
}

const DAY = 86_400_000;
/** Don't nag until there's something worth losing. */
export const NUDGE_MIN_SOLVES = 50;

/**
 * Whether to remind about a backup: never made one with real data at stake,
 * or the last is old *and* a fair amount has happened since. Quiet otherwise.
 */
export function backupNudge(meta: BackupMeta, solveCount: number, now: number): "never" | "stale" | null {
  if (solveCount < NUDGE_MIN_SOLVES) return null;
  if (meta.lastAt === null) return "never";
  const added = solveCount - meta.solvesAt;
  return now - meta.lastAt > 30 * DAY && added >= 25 ? "stale" : null;
}

export type { WcaEvent };
