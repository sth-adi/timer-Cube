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

export async function deleteAllSolvesForSession(sessionId: string): Promise<void> {
  await db.solves.where("sessionId").equals(sessionId).delete();
}
