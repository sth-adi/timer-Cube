import { describe, expect, it } from "vitest";
import { buildBracket, champion, heatWinner, nextMatch, pickHost, rankRound, recordMatch, standings } from "./roomLogic";

describe("rankRound", () => {
  it("scores N..1 by place, shares tied places, gives DNFs nothing", () => {
    const r = rankRound([
      { id: "a", timeMs: 12000 },
      { id: "b", timeMs: 9000 },
      { id: "c", timeMs: null },
      { id: "d", timeMs: 12000 },
    ]);
    expect(r.map((p) => [p.id, p.place, p.points])).toEqual([
      ["b", 1, 4],
      ["a", 2, 3],
      ["d", 2, 3],
      ["c", 4, 0],
    ]);
  });
});

describe("standings", () => {
  it("adds points across rounds and ranks by points then best", () => {
    const s = standings([
      [
        { id: "a", timeMs: 10000 },
        { id: "b", timeMs: 11000 },
      ],
      [
        { id: "a", timeMs: null },
        { id: "b", timeMs: 9000 },
      ],
    ]);
    expect(s[0]).toMatchObject({ id: "b", points: 3, wins: 1, best: 9000, mean: 10000 });
    expect(s[1]).toMatchObject({ id: "a", points: 2, wins: 1, best: 10000, mean: 10000 });
  });
});

describe("bracket", () => {
  it("seeds top against bottom and advances byes", () => {
    const b = buildBracket(["s1", "s2", "s3"]);
    expect(b.rounds).toHaveLength(2);
    expect(b.rounds[0][0]).toMatchObject({ a: "s1", b: null, winner: "s1", bye: true });
    expect(b.rounds[0][1]).toMatchObject({ a: "s2", b: "s3", winner: null });
    expect(b.rounds[1][0].a).toBe("s1");
    expect(nextMatch(b)?.id).toBe("r0m1");
  });

  it("runs a full 4-player knockout to a champion", () => {
    let b = buildBracket(["a", "b", "c", "d"]);
    expect(b.rounds[0].map((m) => [m.a, m.b])).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
    b = recordMatch(b, nextMatch(b)!.id, "d");
    b = recordMatch(b, nextMatch(b)!.id, "b");
    const final = nextMatch(b)!;
    expect([final.a, final.b]).toEqual(["d", "b"]);
    b = recordMatch(b, final.id, "b");
    expect(nextMatch(b)).toBeNull();
    expect(champion(b)).toBe("b");
  });

  it("ignores a winner who isn't in the match, and never re-decides one", () => {
    let b = buildBracket(["a", "b"]);
    b = recordMatch(b, "r0m0", "zzz");
    expect(champion(b)).toBeNull();
    b = recordMatch(b, "r0m0", "a");
    b = recordMatch(b, "r0m0", "b");
    expect(champion(b)).toBe("a");
  });

  it("picks heat winners: faster wins, DNF loses, double DNF goes to the higher seed", () => {
    expect(heatWinner({ a: "x", b: "y" }, { x: 10, y: 9 })).toBe("y");
    expect(heatWinner({ a: "x", b: "y" }, { x: null, y: 20 })).toBe("y");
    expect(heatWinner({ a: "x", b: "y" }, { x: 20, y: null })).toBe("x");
    expect(heatWinner({ a: "x", b: "y" }, { x: null, y: null })).toBe("x");
  });
});

describe("pickHost", () => {
  it("is the longest-present member, id breaking ties", () => {
    expect(pickHost([{ id: "b", joinedAt: 5 }, { id: "a", joinedAt: 5 }, { id: "c", joinedAt: 9 }])).toBe("a");
    expect(pickHost([])).toBeNull();
  });
});
