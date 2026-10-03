import { describe, expect, it } from "vitest";
import type { Session, Solve } from "@/types";
import { suggestSession } from "./sessionSuggestion";

const session = (id: string): Session => ({ id, name: "Session 1", event: "333", createdAt: 1, order: 0 });
const solves = (sessionId: string, n: number): Solve[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${sessionId}-${i}`, sessionId, timeMs: 10000, penalty: "none", scramble: "R", date: i }) as Solve);

describe("suggestSession", () => {
  const sessions = [session("new"), session("old"), session("tiny")];

  it("points a fresh empty session at the one holding the history", () => {
    const s = suggestSession(sessions, [...solves("old", 586), ...solves("tiny", 3)], "new");
    expect(s).toMatchObject({ id: "old", count: 586, activeCount: 0 });
  });

  it("says nothing when the open session is already the big one", () => {
    expect(suggestSession(sessions, [...solves("old", 586), ...solves("tiny", 3)], "old")).toBeNull();
  });

  it("says nothing when the other session is small", () => {
    expect(suggestSession(sessions, solves("old", 12), "new")).toBeNull();
  });

  it("says nothing when the open session has real history of its own", () => {
    expect(suggestSession(sessions, [...solves("new", 100), ...solves("old", 150)], "new")).toBeNull();
  });
});
