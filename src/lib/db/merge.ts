import type { Deletion, Session, Solve } from "@/types";

/**
 * The one conflict rule every sync path uses — device-to-device (sync.ts)
 * and cloud (cloudSync.ts) alike:
 *
 *   For each id, the most recent event wins, where an event is either a
 *   version of the row (timestamped by its `updatedAt`) or a deletion
 *   (timestamped by `deletedAt`).
 *
 * Ties are broken the same way on every device, so any two devices that
 * have exchanged state end up identical: a deletion beats a same-instant
 * edit, and two different versions with the same timestamp are ordered by
 * their content. Deleting a session deletes every solve in it — including
 * solves another device added before it heard about the deletion.
 *
 * Everything here is pure: it takes two snapshots and says what the merged
 * state is, so the rule is tested without a database (merge.test.ts).
 */

export interface SyncState {
  sessions: Session[];
  solves: Solve[];
  deletions: Deletion[];
}

/**
 * Solve fields a cloud row may lack: the columns come from a later migration,
 * so a cloud that hasn't had it (or a row pushed before it) can't carry them.
 * Merging such a row as-is would either drop them or, when it ties a local
 * row on timestamp, lose a coin-flip on content and drop them anyway — copy
 * them over from the local row of the same id first.
 */
export function withLocalOnlyFields(remote: Solve[], local: readonly Solve[]): Solve[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  return remote.map((r) => {
    const mine = byId.get(r.id);
    // A cloud that has the columns sends its own copy, which wins; this only fills in what it lacks.
    const cube = !r.cube && mine?.cube ? mine.cube : undefined;
    const repaired = !r.repaired && mine?.repaired ? mine.repaired : undefined;
    if (!cube && !repaired) return r;
    return { ...r, ...(cube ? { cube } : {}), ...(repaired ? { repaired } : {}) };
  });
}

export const solveRevision = (s: Solve) => s.updatedAt ?? s.date;
export const sessionRevision = (s: Session) => s.updatedAt ?? s.createdAt;

type Winner<T> = { row: T } | { deletion: Deletion };

/**
 * A row's content as a canonical string — keys sorted at every depth and
 * undefined fields dropped — so the same row serializes identically on
 * every device. Used to order same-timestamp versions and to spot changes.
 */
export function contentKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(contentKey).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${contentKey(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** contentKey memoized per object, for the duration of one merge — a row is keyed at most once however many comparisons need it. */
type Keyer = (value: object) => string;
function makeKeyer(): Keyer {
  const cache = new WeakMap<object, string>();
  return (value) => {
    let key = cache.get(value);
    if (key === undefined) {
      key = contentKey(value);
      cache.set(value, key);
    }
    return key;
  };
}

function pick<T extends { id: string }>(
  id: string,
  rows: (T | undefined)[],
  deletions: (Deletion | undefined)[],
  rev: (row: T) => number,
  keyOf: Keyer,
): Winner<T> {
  // At the same instant a deletion outranks any version of the row, and versions order by
  // content — which is only worked out when two events actually tie on time.
  type Event = { at: number; winner: Winner<T>; row?: T };
  const events: Event[] = [
    ...deletions.filter((d): d is Deletion => !!d).map((d) => ({ at: d.deletedAt, winner: { deletion: d } as Winner<T> })),
    ...rows.filter((r): r is T => !!r).map((r) => ({ at: rev(r), winner: { row: r } as Winner<T>, row: r })),
  ];
  if (events.length === 0) throw new Error(`nothing to merge for ${id}`);
  // True when x sorts ahead of y: newer first, then a deletion, then the greater content.
  const ahead = (x: Event, y: Event): boolean => {
    if (x.at !== y.at) return x.at > y.at;
    if (!x.row || !y.row) return !x.row && !!y.row;
    return keyOf(x.row) > keyOf(y.row);
  };
  let best = events[0];
  for (let i = 1; i < events.length; i++) if (ahead(events[i], best)) best = events[i];
  return best.winner;
}

function mergeKind<T extends { id: string }>(
  kind: Deletion["kind"],
  local: T[],
  remote: T[],
  localDel: Deletion[],
  remoteDel: Deletion[],
  rev: (row: T) => number,
  keyOf: Keyer,
): { rows: Map<string, T>; deletions: Map<string, Deletion> } {
  const byId = <X extends { id: string }>(xs: X[]) => new Map(xs.map((x) => [x.id, x]));
  const lr = byId(local);
  const rr = byId(remote);
  const ld = byId(localDel.filter((d) => d.kind === kind));
  const rd = byId(remoteDel.filter((d) => d.kind === kind));
  const ids = new Set([...lr.keys(), ...rr.keys(), ...ld.keys(), ...rd.keys()]);
  const rows = new Map<string, T>();
  const deletions = new Map<string, Deletion>();
  for (const id of ids) {
    const w = pick(id, [lr.get(id), rr.get(id)], [ld.get(id), rd.get(id)], rev, keyOf);
    if ("row" in w) rows.set(id, w.row);
    else deletions.set(id, w.deletion);
  }
  return { rows, deletions };
}

/**
 * The merged state of two snapshots — the same answer whichever side is "local".
 * `remote` may be a partial snapshot (only the rows that changed lately): an id
 * missing from one side is "no information", never a deletion — only a
 * deletion record removes a row.
 */
export function mergeStates(local: SyncState, remote: SyncState, keyOf: Keyer = makeKeyer()): SyncState {
  const sessions = mergeKind("session", local.sessions, remote.sessions, local.deletions, remote.deletions, sessionRevision, keyOf);
  const solves = mergeKind("solve", local.solves, remote.solves, local.deletions, remote.deletions, solveRevision, keyOf);

  // Cascade: a deleted session takes its solves with it. The solve's own
  // deletion is stamped no earlier than its latest edit, so every device
  // agrees it's gone rather than one of them resurrecting it later.
  for (const [id, solve] of solves.rows) {
    const gone = sessions.deletions.get(solve.sessionId);
    if (!gone) continue;
    solves.rows.delete(id);
    solves.deletions.set(id, { id, kind: "solve", deletedAt: Math.max(gone.deletedAt, solveRevision(solve)) });
  }

  return {
    sessions: [...sessions.rows.values()],
    solves: [...solves.rows.values()],
    deletions: [...sessions.deletions.values(), ...solves.deletions.values()],
  };
}

export interface MergePlan {
  putSessions: Session[];
  putSolves: Solve[];
  deleteSessionIds: string[];
  deleteSolveIds: string[];
  putDeletions: Deletion[];
  /** Counts for the UI: rows new to this side, rows whose content changed, rows removed. */
  added: { sessions: number; solves: number };
  updated: number;
  removed: number;
}

/** What has to change in `local` to reach the merged state. `remote` may be partial, as in mergeStates. */
export function planMerge(local: SyncState, remote: SyncState): MergePlan {
  const keyOf = makeKeyer();
  const merged = mergeStates(local, remote, keyOf);
  const localSessions = new Map(local.sessions.map((s) => [s.id, s]));
  const localSolves = new Map(local.solves.map((s) => [s.id, s]));
  const localDel = new Map(local.deletions.map((d) => [d.id, d]));
  // The merged row is one of the two inputs. Unchanged if it is the local object itself; changed
  // if the revisions differ (the revision is part of the content); only when they are equal is
  // the content compared.
  const changed = <T extends object>(mine: T | undefined, merged: T, rev: (row: T) => number) =>
    !mine || (merged !== mine && (rev(merged) !== rev(mine) || keyOf(merged) !== keyOf(mine)));

  const putSessions = merged.sessions.filter((s) => changed(localSessions.get(s.id), s, sessionRevision));
  const putSolves = merged.solves.filter((s) => changed(localSolves.get(s.id), s, solveRevision));
  const deleteSessionIds = merged.deletions.filter((d) => d.kind === "session" && localSessions.has(d.id)).map((d) => d.id);
  const deleteSolveIds = merged.deletions.filter((d) => d.kind === "solve" && localSolves.has(d.id)).map((d) => d.id);
  const putDeletions = merged.deletions.filter((d) => {
    const had = localDel.get(d.id);
    return !had || had.deletedAt !== d.deletedAt;
  });

  return {
    putSessions,
    putSolves,
    deleteSessionIds,
    deleteSolveIds,
    putDeletions,
    added: {
      sessions: putSessions.filter((s) => !localSessions.has(s.id)).length,
      solves: putSolves.filter((s) => !localSolves.has(s.id)).length,
    },
    updated: putSessions.filter((s) => localSessions.has(s.id)).length + putSolves.filter((s) => localSolves.has(s.id)).length,
    removed: deleteSessionIds.length + deleteSolveIds.length,
  };
}
