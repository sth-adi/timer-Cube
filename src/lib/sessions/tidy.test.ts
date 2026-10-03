import { describe, expect, it } from "vitest";
import type { Session, Solve, WcaEvent } from "@/types";
import { planTidy } from "./tidy";

const session = (id: string, order: number, name = "Session 1", event: WcaEvent = "333"): Session => ({ id, name, event, createdAt: order, order });
const solves = (sessionId: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${sessionId}-${i}`, sessionId, timeMs: 10000, penalty: "none", scramble: "R", date: i }) as Solve);

describe("planTidy", () => {
  it("merges the duplicates into the biggest and removes the empties", () => {
    const sessions = [
      session("e1", 0),
      session("e2", 1),
      session("big", 2),
      session("mid", 3),
      session("one", 4),
      session("e3", 5),
    ];
    const all = [...solves("big", 586), ...solves("mid", 11), ...solves("one", 1)];
    const plan = planTidy(sessions, all, "e1");
    expect(plan.merges).toEqual([
      { from: "mid", into: "big" },
      { from: "one", into: "big" },
    ]);
    expect(plan.removeEmpty).toEqual(["e1", "e2", "e3"]);
    expect(plan.summary).toBe("Merge 2 sessions named Session 1 into the one with 586 solves · remove 3 empty sessions");
  });

  it("does nothing when sessions are distinct and all have solves", () => {
    const sessions = [session("a", 0, "Morning"), session("b", 1, "Evening")];
    const plan = planTidy(sessions, [...solves("a", 3), ...solves("b", 2)], "a");
    expect(plan).toEqual({ merges: [], removeEmpty: [], summary: "" });
  });

  it("keeps at least one session, preferring the open one", () => {
    const sessions = [session("a", 0), session("b", 1), session("c", 2)];
    const plan = planTidy(sessions, [], "b");
    expect(plan.merges).toEqual([]);
    expect(plan.removeEmpty).toEqual(["a", "c"]);
    expect(plan.summary).toBe("remove 2 empty sessions");
  });

  it("keeps the first session when the open one is unknown and all are empty", () => {
    const plan = planTidy([session("a", 0), session("b", 1)], [], null);
    expect(plan.removeEmpty).toEqual(["b"]);
  });

  it("does not merge same-named sessions of different events", () => {
    const sessions = [session("a", 0, "Session 1", "333"), session("b", 1, "Session 1", "222")];
    const plan = planTidy(sessions, [...solves("a", 4), ...solves("b", 5)], "a");
    expect(plan).toEqual({ merges: [], removeEmpty: [], summary: "" });
  });

  it("prefers the open session as merge target on a tie", () => {
    const sessions = [session("a", 0), session("b", 1)];
    const plan = planTidy(sessions, [...solves("a", 3), ...solves("b", 3)], "b");
    expect(plan.merges).toEqual([{ from: "a", into: "b" }]);
    expect(plan.summary).toBe("Merge 1 session named Session 1 into the one with 3 solves");
  });
});
