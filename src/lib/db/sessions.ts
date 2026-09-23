import { db, newId } from "./db";
import type { Session, WcaEvent } from "@/types";
import { deleteAllSolvesForSession } from "./solves";

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy("order").toArray();
}

export async function createSession(name: string, event: WcaEvent = "333"): Promise<Session> {
  const count = await db.sessions.count();
  const session: Session = {
    id: newId(),
    name,
    event,
    createdAt: Date.now(),
    order: count,
    updatedAt: Date.now(),
  };
  await db.sessions.add(session);
  return session;
}

export async function renameSession(id: string, name: string): Promise<void> {
  await db.sessions.update(id, { name, updatedAt: Date.now() });
}

/** Deletes a session and its solves, recording each deletion so sync propagates it. */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction("rw", db.sessions, db.solves, db.deletions, async () => {
    await deleteAllSolvesForSession(id);
    await db.sessions.delete(id);
    await db.deletions.put({ id, kind: "session", deletedAt: Date.now() });
  });
}
