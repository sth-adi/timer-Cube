import { describe, expect, it } from "vitest";
import type { Session, Solve } from "@/types";
import { pickInitialSession, summarizeSessions } from "./activeSession";

const session = (id: string, order: number): Session => ({ id, name: "Session 1", event: "333", createdAt: order, order });
const solve = (id: string, sessionId: string, date: number) => ({ id, sessionId, timeMs: 10000, penalty: "none", scramble: "R", date }) as Solve;

describe("pickInitialSession", () => {
  const sessions = [session("empty", 0), session("history", 1), session("small", 2)];
  const solves = [solve("a", "history", 5), solve("b", "history", 9), solve("c", "small", 3)];

  it("reopens the session saved on this device", () => {
    expect(pickInitialSession(sessions, solves, "small")?.id).toBe("small");
  });

  it("opens the session with the most solves when nothing was saved", () => {
    expect(pickInitialSession(sessions, solves, null)?.id).toBe("history");
  });

  it("ignores a saved id that no longer exists", () => {
    expect(pickInitialSession(sessions, solves, "deleted-elsewhere")?.id).toBe("history");
  });

  it("falls back to the first session when none has solves", () => {
    expect(pickInitialSession(sessions, [], null)?.id).toBe("empty");
  });

  it("returns null with no sessions", () => {
    expect(pickInitialSession([], [], "x")).toBeNull();
  });
});

describe("summarizeSessions", () => {
  it("counts solves and finds the latest per session", () => {
    const m = summarizeSessions([solve("a", "s1", 5), solve("b", "s1", 9), solve("c", "s2", 3)]);
    expect(m.get("s1")).toEqual({ count: 2, lastSolveAt: 9 });
    expect(m.get("s2")).toEqual({ count: 1, lastSolveAt: 3 });
    expect(m.get("s3")).toBeUndefined();
  });
});
