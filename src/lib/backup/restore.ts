import { readLocalState, mergeSyncPayload, type MergeResult } from "@/lib/db/sync";
import { downloadJson } from "@/lib/utils/sessionExport";
import { backupSummary, buildBackup, collectStorage, parseBackup, type BackupFile, type BackupMeta } from "./backup";

const META_KEY = "cube-timer-backup-meta";

export interface StoredBackupMeta extends BackupMeta {
  /** Don't remind again before this time (the cuber said "later"). */
  snoozedUntil: number | null;
}

export function readBackupMeta(): StoredBackupMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) ?? "null") as Partial<StoredBackupMeta> | null;
    return { lastAt: typeof raw?.lastAt === "number" ? raw.lastAt : null, solvesAt: typeof raw?.solvesAt === "number" ? raw.solvesAt : 0, snoozedUntil: typeof raw?.snoozedUntil === "number" ? raw.snoozedUntil : null };
  } catch {
    return { lastAt: null, solvesAt: 0, snoozedUntil: null };
  }
}

export function writeBackupMeta(meta: StoredBackupMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Not remembered — the reminder just comes back.
  }
}

/** Reads everything on this device into a backup file. */
export async function createBackup(now = Date.now()): Promise<BackupFile> {
  return buildBackup(await readLocalState(), collectStorage(localStorage), now);
}

/** Downloads a backup and notes when, so the reminder knows. */
export async function downloadBackup(): Promise<BackupFile> {
  const file = await createBackup();
  const stamp = new Date(file.exportedAt).toISOString().slice(0, 10);
  downloadJson(`cube-timer-backup-${stamp}.json`, file);
  writeBackupMeta({ lastAt: file.exportedAt, solvesAt: file.sync.solves.length, snoozedUntil: null });
  return file;
}

export interface RestoreResult {
  merge: MergeResult;
  skipped: number;
  settingsRestored: number;
}

/** Reads a backup file's text and validates it, without changing anything — for the confirmation step. */
export function previewBackup(text: string): { file: BackupFile; skipped: number; summary: ReturnType<typeof backupSummary> } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const { file, skipped } = parseBackup(raw);
  return { file, skipped, summary: backupSummary(file) };
}

/**
 * Merges a backup into this device: solves and sessions under the newest-wins
 * sync rule (nothing newer is overwritten, nothing deleted since comes back),
 * and — if asked — the settings and progress records, which replace what's here.
 */
export async function restoreBackup(file: BackupFile, opts: { settings: boolean }): Promise<RestoreResult> {
  const merge = await mergeSyncPayload(file.sync);
  let settingsRestored = 0;
  if (opts.settings) {
    for (const [key, value] of Object.entries(file.storage)) {
      try {
        localStorage.setItem(key, value);
        settingsRestored++;
      } catch {
        // Storage full or blocked: skip this one.
      }
    }
  }
  return { merge, skipped: 0, settingsRestored };
}
