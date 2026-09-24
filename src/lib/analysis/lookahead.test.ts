import { describe, expect, it } from "vitest";
import { MIN_HANDOFFS, summarizeLookahead, type Handoff } from "./lookahead";

const many = (n: number, h: Handoff) => Array.from({ length: n }, () => h);

describe("summarizeLookahead", () => {
  it("returns null under MIN_HANDOFFS", () => {
    expect(summarizeLookahead(many(MIN_HANDOFFS - 1, { prevMsPerTurn: 100, prevTurns: 8, nextFindMs: 800 }), 10)).toBeNull();
  });

  it("recommends slowing down when the pause saved beats the turning time spent", () => {
    // Calm pairs cost 40ms × 7 gaps = 280ms more to turn but save 800ms of pause.
    const hs = [...many(20, { prevMsPerTurn: 100, prevTurns: 8, nextFindMs: 1200 }), ...many(20, { prevMsPerTurn: 140, prevTurns: 8, nextFindMs: 400 })];
    const r = summarizeLookahead(hs, 10)!;
    expect(r.verdict).toBe("slow-down");
    expect(r.slowdownCostMs).toBeCloseTo(280);
    expect(r.netGainMs).toBeCloseTo(800 - 280);
    expect(r.headline).toMatch(/would net you about/);
  });

  it("says keep pace when calm turning costs more than it saves", () => {
    const hs = [...many(20, { prevMsPerTurn: 100, prevTurns: 8, nextFindMs: 900 }), ...many(20, { prevMsPerTurn: 200, prevTurns: 8, nextFindMs: 700 })];
    expect(summarizeLookahead(hs, 10)!.verdict).toBe("keep-pace");
  });

  it("says there's no link when the pause doesn't depend on turning pace", () => {
    const hs = [...many(20, { prevMsPerTurn: 100, prevTurns: 8, nextFindMs: 900 }), ...many(20, { prevMsPerTurn: 200, prevTurns: 8, nextFindMs: 890 })];
    const r = summarizeLookahead(hs, 10)!;
    expect(r.verdict).toBe("no-link");
    expect(r.headline).toMatch(/aren't looking ahead while turning/);
  });
});
