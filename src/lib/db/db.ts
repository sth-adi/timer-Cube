import Dexie, { type EntityTable } from "dexie";
import type { Deletion, Session, Solve } from "@/types";

export class CubeTimerDB extends Dexie {
  sessions!: EntityTable<Session, "id">;
  solves!: EntityTable<Solve, "id">;
  /** Records of deleted sessions/solves, so sync can propagate deletions (see lib/db/merge.ts). */
  deletions!: EntityTable<Deletion, "id">;

  constructor() {
    super("cube-timer-db");
    this.version(1).stores({
      sessions: "id, order, createdAt",
      solves: "id, sessionId, date, [sessionId+date]",
    });
    this.version(2).stores({
      deletions: "id, kind, deletedAt",
    });
  }
}

export const db = new CubeTimerDB();

export function newId(): string {
  return crypto.randomUUID();
}

export async function ensureDefaultSession(): Promise<Session> {
  // Wrapped in a transaction so two concurrent callers (e.g. React
  // StrictMode's double-invoked effects in dev) can't both see an empty
  // table and each insert their own "Session 1" — Dexie serializes
  // read-write transactions on the same table.
  return db.transaction("rw", db.sessions, async () => {
    const first = await db.sessions.orderBy("order").first();
    if (first) return first;
    const session: Session = {
      id: newId(),
      name: "Session 1",
      event: "333",
      createdAt: Date.now(),
      order: 0,
      updatedAt: Date.now(),
    };
    await db.sessions.add(session);
    return session;
  });
}
