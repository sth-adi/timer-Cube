import type { Deletion, FullSolve, Session } from "@/types";

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
 * their content. Deleting a session deletes the solves in it that are not newer
 * than the deletion — including ones another device added before it heard about
 * it. A solve recorded or edited AFTER the deletion (offline on a trip, in a
 * session deleted at home) is never destroyed by it: it is re-homed into a
 * "Recovered" session (see cascadeSolve).
 *
 * Everything here is pure: it takes two snapshots and says what the merged
 * state is, so the rule is tested without a database (merge.test.ts).
 */

export interface SyncState {
  sessions: Session[];
  solves: FullSolve[];
  deletions: Deletion[];
}

/**
 * Solve fields a cloud row may lack: the columns come from a later migration,
 * so a cloud that hasn't had it (or a row pushed before it) can't carry them.
 * Merging such a row as-is would either drop them or, when it ties a local
 * row on timestamp, lose a coin-flip on content and drop them anyway — copy
 * them over from the local row of the same id first.
 */
export function withLocalOnlyFields(remote: FullSolve[], local: readonly FullSolve[]): FullSolve[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  return remote.map((r) => {
    const mine = byId.get(r.id);
    // A cloud that has the columns sends its own copy, which wins; this only fills in what it lacks.
    const cube = !r.cube && mine?.cube ? mine.cube : undefined;
    const repaired = !r.repaired && mine?.repaired ? mine.repaired : undefined;
    // The recorded streams too: a row pushed before the cloud had a column for them must not
    // wipe what this device captured when it wins the merge.
    const gyroStream = !r.gyroStream && mine?.gyroStream ? mine.gyroStream : undefined;
    const moveTimestamps = !r.moveTimestamps && mine?.moveTimestamps ? mine.moveTimestamps : undefined;
    if (!cube && !repaired && !gyroStream && !moveTimestamps) return r;
    return { ...r, ...(cube ? { cube } : {}), ...(repaired ? { repaired } : {}), ...(gyroStream ? { gyroStream } : {}), ...(moveTimestamps ? { moveTimestamps } : {}) };
  });
}

export const solveRevision = (s: Pick<FullSolve, "updatedAt" | "date">) => s.updatedAt ?? s.date;
export const sessionRevision = (s: Session) => s.updatedAt ?? s.createdAt;

/** Name of the session that takes in solves a session deletion must not destroy (followed by the deleted session's name, when known). */
export const RECOVERED_SESSION_NAME = "Recovered";

/**
 * The id of the session that takes in what survives `deletedSessionId`'s deletion. Derived from the
 * deleted session's id — a pure function of it, not a random id — so every device that merges the
 * same deletion files the survivors into the very same session instead of each making its own.
 * Shaped like a v4 UUID (the cloud's id columns may be uuids), from four 32-bit hash lanes of the id.
 */
export function recoveredSessionId(deletedSessionId: string): string {
  const input = `recovered-session:${deletedSessionId}`;
  const hex = [0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => {
      let h = seed;
      for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
      // murmur3's finalizer: spreads every input bit across the lane.
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      return (h >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
  const variant = "89ab"[parseInt(hex[16], 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** What a session deletion does to one solve filed under it. */
export type CascadeOutcome =
  /** Not under a deleted session (or its session's deletion lost): untouched. */
  | { kind: "keep"; solve: FullSolve }
  /** Older than the deletion (or exactly at it): goes with its session. */
  | { kind: "drop"; deletedAt: number }
  /** Newer than the deletion: filed into the Recovered session, `via` listing the deleted sessions it was moved out of, in order. */
  | { kind: "rehome"; solve: FullSolve; via: string[] };

/**
 * The rule for a solve whose session may have been deleted (`deletedSessions`: deletion record per
 * session id). Same newest-wins rule as everything else: the deletion removes what existed when it
 * happened, so a solve whose revision (updatedAt, else date) is strictly newer than `deletedAt`
 * survives, and one at the very same instant goes (a deletion beats a same-instant edit).
 *
 * A survivor is re-homed into `recoveredSessionId(deleted id)` and its revision bumped by exactly
 * one — which is what makes the move win over the old copy (still filed under the deleted session)
 * on every other device and in the cloud, and, being a function of the solve alone, comes out the
 * same on every device. If that Recovered session was itself deleted later still, the solve is
 * judged against that deletion in turn.
 */
export function cascadeSolve(solve: FullSolve, deletedSessions: ReadonlyMap<string, Deletion>): CascadeOutcome {
  let current = solve;
  const via: string[] = [];
  // Each hop needs a deletion record for a freshly derived id, so this ends at once in practice; the cap is only a backstop.
  for (let hops = 0; hops < 16; hops++) {
    const gone = deletedSessions.get(current.sessionId);
    if (!gone) return via.length === 0 ? { kind: "keep", solve } : { kind: "rehome", solve: current, via };
    const revision = solveRevision(current);
    if (revision <= gone.deletedAt) return { kind: "drop", deletedAt: Math.max(gone.deletedAt, revision) };
    via.push(current.sessionId);
    current = { ...current, sessionId: recoveredSessionId(current.sessionId), updatedAt: revision + 1 };
  }
  return { kind: "rehome", solve: current, via };
}

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

  // Cascade: a deleted session takes the solves that existed when it was deleted with it. The solve's
  // own deletion is stamped no earlier than its latest edit, so every device agrees it's gone rather
  // than one of them resurrecting it later. Solves newer than the deletion are re-homed instead
  // (cascadeSolve) into a Recovered session, created here if the merge doesn't already have it.
  if (sessions.deletions.size > 0) {
    const known = new Map<string, Session>();
    for (const s of [...local.sessions, ...remote.sessions]) {
      const had = known.get(s.id);
      if (!had || sessionRevision(s) > sessionRevision(had)) known.set(s.id, s);
    }
    for (const [id, solve] of [...solves.rows]) {
      const outcome = cascadeSolve(solve, sessions.deletions);
      if (outcome.kind === "keep") continue;
      if (outcome.kind === "drop") {
        solves.rows.delete(id);
        solves.deletions.set(id, { id, kind: "solve", deletedAt: outcome.deletedAt });
        continue;
      }
      solves.rows.set(id, outcome.solve);
      const recoveredId = outcome.solve.sessionId;
      if (!sessions.rows.has(recoveredId)) {
        // Only the last hop's session is live (an earlier one was deleted); its deleted predecessor names and sizes it.
        const from = outcome.via[outcome.via.length - 1];
        const origin = known.get(from);
        const at = sessions.deletions.get(from)?.deletedAt ?? 0;
        sessions.rows.set(recoveredId, {
          id: recoveredId,
          name: origin ? `${RECOVERED_SESSION_NAME} (${origin.name})` : RECOVERED_SESSION_NAME,
          event: origin?.event ?? "333",
          createdAt: at,
          order: origin?.order ?? 0,
          updatedAt: at,
        });
      }
    }
  }

  return {
    sessions: [...sessions.rows.values()],
    solves: [...solves.rows.values()],
    deletions: [...sessions.deletions.values(), ...solves.deletions.values()],
  };
}

/**
 * Which local solves a merge of `remote` into this device can possibly touch, so a merge need not
 * read the whole solves table: a solve is only ever changed by a remote row or a deletion record
 * carrying its id, or by the cascade of a session deletion (local or remote) to the solves filed
 * under that session. Every other local solve is "no information" and comes out of planMerge
 * untouched — so `planMerge` over just these solves gives exactly the plan it gives over all of
 * them (merge.test.ts checks that on random states).
 */
export function solvesAMergeCanTouch(
  local: Pick<SyncState, "deletions">,
  remote: Pick<SyncState, "solves" | "deletions">,
): { solveIds: string[]; sessionIds: string[] } {
  const solveIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const s of remote.solves) solveIds.add(s.id);
  for (const d of [...local.deletions, ...remote.deletions]) (d.kind === "solve" ? solveIds : sessionIds).add(d.id);
  return { solveIds: [...solveIds], sessionIds: [...sessionIds] };
}

export interface MergePlan {
  putSessions: Session[];
  putSolves: FullSolve[];
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
