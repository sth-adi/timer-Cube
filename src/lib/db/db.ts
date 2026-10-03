import Dexie, { type EntityTable } from "dexie";
import type { Deletion, FullSolve, Session } from "@/types";
import { rememberAutoSessionId } from "@/lib/sessions/activeSession";

export class CubeTimerDB extends Dexie {
  sessions!: EntityTable<Session, "id">;
  /** Rows are FullSolve — with the gyro stream. The in-memory `Solve` is slimmer and must never be written here (see types/index.ts). */
  solves!: EntityTable<FullSolve, "id">;
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
    // Remembered so the first cloud sync can drop it again if the account turns out to already have sessions.
    rememberAutoSessionId(session.id);
    return session;
  });
}
