import { describe, expect, it } from "vitest";
import type { Session, Solve } from "@/types";
import { MIN_PER_GROUP, buildEventMix, groupEventStats, summarizeEventMix, type EventStat } from "./eventMix";

function makeSession(id: string, event: Session["event"]): Session {
  return { id, name: id, event, createdAt: 0, order: 0 };
}

function makeSolve(id: string, sessionId: string, timeMs: number, opts: Partial<Solve> = {}): Solve {
  return { id, sessionId, timeMs, penalty: "none", scramble: "R U R' U'", date: 1, ...opts };
}

describe("groupEventStats", () => {
  it("groups by (puzzle, tag), skips solves whose session is missing, and excludes DNFs", () => {
    const sessions = [makeSession("s333", "333"), makeSession("s333oh", "333"), makeSession("s444", "444")];
    const solves: Solve[] = [
      ...Array.from({ length: 12 }, (_, i) => makeSolve(`a${i}`, "s333", 10_000)),
      ...Array.from({ length: 12 }, (_, i) => makeSolve(`b${i}`, "s333oh", 20_000, { event: "oh" })),
      makeSolve("orphan", "no-such-session", 5000),
      makeSolve("dnf", "s333", 10_000, { penalty: "dnf" }),
    ];
    const stats = groupEventStats(solves, sessions);
    expect(stats.map((s) => s.key).sort()).toEqual(["333", "333:oh"]);
    const twoHanded = stats.find((s) => s.key === "333")!;
    expect(twoHanded.count).toBe(12);
    expect(twoHanded.tag).toBeNull();
    expect(twoHanded.label).toBe("3x3");
    const oh = stats.find((s) => s.key === "333:oh")!;
    expect(oh.label).toBe("3x3 One-Handed");
    expect(oh.avgMs).toBeCloseTo(20_000);
  });

  it("applies +2 penalties to the final time and drops groups under MIN_PER_GROUP", () => {
    const sessions = [makeSession("s", "333")];
    const solves: Solve[] = [
      ...Array.from({ length: MIN_PER_GROUP - 2 }, (_, i) => makeSolve(`x${i}`, "s", 10_000)),
      makeSolve("plus2", "s", 10_000, { penalty: "plus2" }),
    ];
    expect(groupEventStats(solves, sessions)).toEqual([]);
    solves.push(makeSolve("last", "s", 10_000));
    const [stat] = groupEventStats(solves, sessions);
    expect(stat.count).toBe(MIN_PER_GROUP);
    // One of the MIN_PER_GROUP solves got +2, the rest are plain 10s.
    expect(stat.avgMs).toBeCloseTo((10_000 * (MIN_PER_GROUP - 1) + 12_000) / MIN_PER_GROUP);
  });
});

describe("summarizeEventMix", () => {
  const stat = (key: string, puzzle: EventStat["puzzle"], tag: EventStat["tag"], avgMs: number, label = key): EventStat => ({
    key,
    puzzle,
    tag,
    label,
    count: MIN_PER_GROUP,
    avgMs,
    bestMs: avgMs * 0.8,
  });

  it("returns null without a 333/no-tag baseline, or with nothing else to compare", () => {
    expect(summarizeEventMix([stat("444", "444", null, 40_000)])).toBeNull();
    expect(summarizeEventMix([stat("333", "333", null, 10_000)])).toBeNull();
  });

  it("ranks every other group against the baseline, slowest first", () => {
    const stats = [
      stat("333", "333", null, 10_000, "3x3"),
      stat("222", "222", null, 3_000, "2x2"),
      stat("333:oh", "333", "oh", 22_000, "3x3 One-Handed"),
      stat("444", "444", null, 40_000, "4x4"),
    ];
    const report = summarizeEventMix(stats)!;
    expect(report.baseline.key).toBe("333");
    expect(report.others.map((o) => o.key)).toEqual(["444", "333:oh", "222"]);
    expect(report.others.find((o) => o.key === "444")!.ratio).toBeCloseTo(4);
    expect(report.others.find((o) => o.key === "222")!.ratio).toBeCloseTo(0.3);
    expect(report.headline).toMatch(/4x4 runs 4\.00x/);
    expect(report.headline).toMatch(/2x2 runs 0\.30x/);
  });
});

describe("buildEventMix", () => {
  it("wires groupEventStats into summarizeEventMix end to end", () => {
    const sessions = [makeSession("s333", "333"), makeSession("s222", "222")];
    const solves: Solve[] = [
      ...Array.from({ length: MIN_PER_GROUP }, (_, i) => makeSolve(`a${i}`, "s333", 10_000)),
      ...Array.from({ length: MIN_PER_GROUP }, (_, i) => makeSolve(`b${i}`, "s222", 3_000)),
    ];
    const report = buildEventMix(solves, sessions);
    expect(report).not.toBeNull();
    expect(report!.others[0].key).toBe("222");
  });

  it("returns null with no matching sessions", () => {
    expect(buildEventMix([makeSolve("a", "nowhere", 10_000)], [])).toBeNull();
  });
});
