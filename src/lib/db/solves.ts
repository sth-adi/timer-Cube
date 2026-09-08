import { db, newId } from "./db";
import type { Penalty, Solve } from "@/types";

export async function addSolve(input: {
  sessionId: string;
  timeMs: number;
  scramble: string;
  penalty?: Penalty;
}): Promise<Solve> {
  const solve: Solve = {
    id: newId(),
    sessionId: input.sessionId,
    timeMs: input.timeMs,
    penalty: input.penalty ?? "none",
    scramble: input.scramble,
    date: Date.now(),
  };
  await db.solves.add(solve);
  return solve;
}

export async function updateSolve(id: string, changes: Partial<Omit<Solve, "id">>): Promise<void> {
  await db.solves.update(id, changes);
}

export async function deleteSolve(id: string): Promise<void> {
  await db.solves.delete(id);
}

export async function getSessionSolves(sessionId: string): Promise<Solve[]> {
  return db.solves.where("sessionId").equals(sessionId).sortBy("date");
}

/** Every solve across every session — the basis for lifetime achievements/streaks/goals. */
export async function getAllSolves(): Promise<Solve[]> {
  return db.solves.orderBy("date").toArray();
}

export async function deleteAllSolvesForSession(sessionId: string): Promise<void> {
  await db.solves.where("sessionId").equals(sessionId).delete();
}

/** Bulk-imports solves into a session, assigning fresh ids so they never collide with existing rows. */
export async function importSolves(
  sessionId: string,
  solves: Array<Pick<Solve, "timeMs" | "penalty" | "scramble" | "date" | "comment">>,
): Promise<number> {
  const rows: Solve[] = solves.map((s) => ({
    id: newId(),
    sessionId,
    timeMs: s.timeMs,
    penalty: s.penalty,
    scramble: s.scramble,
    date: s.date,
    comment: s.comment,
  }));
  await db.solves.bulkAdd(rows);
  return rows.length;
}
