import { db, newId } from "./db";
import type { Session } from "@/types";
import { deleteAllSolvesForSession } from "./solves";

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy("order").toArray();
}

export async function createSession(name: string): Promise<Session> {
  const count = await db.sessions.count();
  const session: Session = {
    id: newId(),
    name,
    event: "333",
    createdAt: Date.now(),
    order: count,
  };
  await db.sessions.add(session);
  return session;
}

export async function renameSession(id: string, name: string): Promise<void> {
  await db.sessions.update(id, { name });
}

export async function deleteSession(id: string): Promise<void> {
  await deleteAllSolvesForSession(id);
  await db.sessions.delete(id);
}
