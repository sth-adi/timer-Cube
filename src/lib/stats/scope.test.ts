import { describe, expect, it } from "vitest";
import { scopedSolves } from "./scope";
import type { Session, Solve } from "@/types";

function session(id: string, event: Session["event"]): Session {
  return { id, name: id, event, createdAt: 0, order: 0 };
}

function solve(id: string, sessionId: string, date: number): Solve {
  return { id, sessionId, timeMs: 10000, penalty: "none", scramble: "", date };
}

const sessions = [session("a", "333"), session("b", "333"), session("c", "222")];
const a1 = solve("a1", "a", 300);
const a2 = solve("a2", "a", 500);
const b1 = solve("b1", "b", 100);
const b2 = solve("b2", "b", 400);
const c1 = solve("c1", "c", 200);
const all = [a1, a2, b1, b2, c1];

describe("scopedSolves", () => {
  it("passes the session solves through untouched for the session scope", () => {
    const own = [a1, a2];
    expect(scopedSolves("session", "a", sessions, own, all)).toBe(own);
  });

  it("combines every session of the open session's event, oldest first", () => {
    const out = scopedSolves("all", "a", sessions, [a1, a2], all);
    expect(out.map((s) => s.id)).toEqual(["b1", "a1", "b2", "a2"]);
  });

  it("never mixes in other events", () => {
    expect(scopedSolves("all", "c", sessions, [c1], all).map((s) => s.id)).toEqual(["c1"]);
    expect(scopedSolves("all", "a", sessions, [a1, a2], all).some((s) => s.id === "c1")).toBe(false);
  });

  it("does not reorder or mutate the input", () => {
    const input = [a2, c1, b1];
    scopedSolves("all", "a", sessions, [a2], input);
    expect(input.map((s) => s.id)).toEqual(["a2", "c1", "b1"]);
  });

  it("drops solves whose session is unknown", () => {
    const orphan = solve("x", "gone", 50);
    expect(scopedSolves("all", "a", sessions, [a1], [orphan, a1]).map((s) => s.id)).toEqual(["a1"]);
  });

  it("falls back to the session solves when there is no open session", () => {
    const own = [a1];
    expect(scopedSolves("all", null, sessions, own, all)).toBe(own);
    expect(scopedSolves("all", "missing", sessions, own, all)).toBe(own);
  });
});
