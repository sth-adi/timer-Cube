import { parseManualTime } from "@/lib/utils/time";

/** A time added by hand: the id `recordSolve` returned for it, and the time that was typed. */
export interface AddedTime {
  id: string;
  ms: number;
}

/** How many "just added" chips ManualEntry keeps. */
export const RECENT_LIMIT = 5;

/** Adds a chip, dropping the oldest once there are more than RECENT_LIMIT. */
export function withAdded(added: AddedTime[], entry: AddedTime): AddedTime[] {
  return [...added.slice(-(RECENT_LIMIT - 1)), entry];
}

export type ManualSubmit = { ok: true; entry: AddedTime } | { ok: false; error: string | null };

/**
 * Parses a typed time and saves it. `record` is the store's `recordSolve`: it resolves to the new
 * solve's id, or undefined when the save failed (the store has already set `saveError` then).
 * The chip's id is always the one returned for this very save, never "whatever solve is last" —
 * another solve can land in between (a smart-cube solve, a second entry typed in quickly).
 * `error` is a message for the input when the text isn't a time, and null when the save itself failed.
 */
export async function submitManualTime(
  value: string,
  scramble: string,
  record: (ms: number, scramble: string) => Promise<string | undefined>,
): Promise<ManualSubmit> {
  const parsed = parseManualTime(value);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const id = await record(parsed.ms, scramble);
  if (id === undefined) return { ok: false, error: null };
  return { ok: true, entry: { id, ms: parsed.ms } };
}
