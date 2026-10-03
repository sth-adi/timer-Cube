import { describe, expect, it } from "vitest";
import type { Session, Solve } from "@/types";
import { mergeStates, planMerge, withLocalOnlyFields, type SyncState } from "./merge";
import { newestSyncedAt, pullSince } from "./cloudSync";

const solve = (id: string, t: number, extra: Partial<Solve> = {}): Solve => ({
  id,
  sessionId: "S",
  timeMs: 10_000,
  penalty: "none",
  scramble: "R U",
  date: t,
  updatedAt: t,
  ...extra,
});
const session = (id: string, t: number): Session => ({ id, name: id, event: "333", createdAt: t, order: 0, updatedAt: t });

const local: SyncState = {
  sessions: [session("S", 1)],
  solves: [solve("a", 10), solve("b", 20), solve("c", 30)],
  deletions: [{ id: "old", kind: "solve", deletedAt: 5 }],
};

describe("merging a partial remote snapshot (incremental pull)", () => {
  it("treats rows the remote doesn't list as no information, not as deletions", () => {
    const remote: SyncState = { sessions: [], solves: [solve("b", 25, { penalty: "plus2" })], deletions: [] };
    const merged = mergeStates(local, remote);
    expect(merged.solves.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
    expect(merged.solves.find((s) => s.id === "b")?.penalty).toBe("plus2");
    expect(merged.sessions.map((s) => s.id)).toEqual(["S"]);
    expect(merged.deletions.map((d) => d.id)).toEqual(["old"]);

    const plan = planMerge(local, remote);
    expect(plan.putSolves.map((s) => s.id)).toEqual(["b"]);
    expect(plan.deleteSolveIds).toEqual([]);
    expect(plan.deleteSessionIds).toEqual([]);
    expect(plan.putDeletions).toEqual([]);
    expect(plan.removed).toBe(0);
  });

  it("an empty remote changes nothing", () => {
    const plan = planMerge(local, { sessions: [], solves: [], deletions: [] });
    expect(plan.putSolves.length + plan.putSessions.length + plan.deleteSolveIds.length + plan.deleteSessionIds.length + plan.putDeletions.length).toBe(0);
  });

  it("only an explicit deletion record removes a row", () => {
    const remote: SyncState = { sessions: [], solves: [], deletions: [{ id: "a", kind: "solve", deletedAt: 40 }] };
    const plan = planMerge(local, remote);
    expect(plan.deleteSolveIds).toEqual(["a"]);
    expect(plan.removed).toBe(1);
    expect(mergeStates(local, remote).solves.map((s) => s.id).sort()).toEqual(["b", "c"]);
  });

  it("a newer local edit beats an older deletion that arrives in the partial pull", () => {
    const remote: SyncState = { sessions: [], solves: [], deletions: [{ id: "c", kind: "solve", deletedAt: 29 }] };
    const plan = planMerge(local, remote);
    expect(plan.deleteSolveIds).toEqual([]);
    expect(mergeStates(local, remote).solves.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("a session deletion in the partial pull still takes its local solves with it", () => {
    const remote: SyncState = { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 50 }] };
    const merged = mergeStates(local, remote);
    expect(merged.sessions).toEqual([]);
    expect(merged.solves).toEqual([]);
    expect(planMerge(local, remote).removed).toBe(4);
  });

  it("reaches the same state as merging the full remote snapshot", () => {
    const full: SyncState = {
      sessions: [session("S", 1)],
      solves: [solve("a", 10), solve("b", 25, { penalty: "dnf" }), solve("c", 30), solve("d", 60)],
      deletions: [{ id: "old", kind: "solve", deletedAt: 5 }],
    };
    const partial: SyncState = { ...full, sessions: [], solves: [full.solves[1], full.solves[3]], deletions: [] };
    const key = (s: SyncState) => JSON.stringify([s.sessions, s.solves, s.deletions].map((xs) => [...xs].sort((x, y) => x.id.localeCompare(y.id))));
    expect(key(mergeStates(local, partial))).toBe(key(mergeStates(local, full)));
  });
});

describe("withLocalOnlyFields", () => {
  it("lets the cloud's own cube win over the local one", () => {
    const mine = solve("a", 5, { cube: { id: "mac:AA", name: "Local" } });
    const theirs = solve("a", 5, { cube: { id: "mac:BB", name: "Cloud" } });
    expect(withLocalOnlyFields([theirs], [mine])[0].cube?.id).toBe("mac:BB");
  });
});

describe("pullSince", () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const now = 1_000 * DAY;
  it("is a full pull (null) when anything is missing", () => {
    expect(pullSince(0, now - HOUR, now - HOUR, now)).toBeNull();
    expect(pullSince(now - HOUR, 0, now - HOUR, now)).toBeNull();
    expect(pullSince(now - HOUR, now - HOUR, 0, now)).toBeNull();
  });
  it("is a full pull once the last one is over a week old, or the clock has gone backwards", () => {
    expect(pullSince(now - HOUR, now - 8 * DAY, now - HOUR, now)).toBeNull();
    expect(pullSince(now - HOUR, now + HOUR, now - HOUR, now)).toBeNull();
  });
  it("otherwise starts two minutes before the mark", () => {
    expect(pullSince(now - HOUR, now - 2 * DAY, now - HOUR, now)).toBe(now - HOUR - 2 * 60_000);
  });
});

describe("newestSyncedAt", () => {
  it("is the newest server stamp across all three tables", () => {
    expect(
      newestSyncedAt(
        [{ synced_at: "2026-10-04T10:00:00.123456+00:00" }],
        [{ synced_at: "2026-10-04T12:00:00+00:00" }, {}],
        [{ synced_at: "2026-10-04T11:00:00Z" }],
      ),
    ).toBe(Date.parse("2026-10-04T12:00:00Z"));
  });
  it("is 0 (so every pull stays full) when the cloud sends no stamps", () => {
    expect(newestSyncedAt([{}], [], [{}])).toBe(0);
    expect(newestSyncedAt([], [], [])).toBe(0);
  });
});

describe("what an incremental pull picks up", () => {
  // The cloud as rows with a server stamp; the pull filter is the one fetchAllRows applies.
  const HOUR = 3_600_000;
  const T = Date.parse("2026-10-04T12:00:00Z");
  type Stamped = { solve: Solve; syncedAt: number };
  const pulledSince = (cloud: Stamped[], since: number) => cloud.filter((r) => r.syncedAt > since).map((r) => r.solve);

  it("includes rows recorded offline long ago (old revision) but uploaded after the mark", () => {
    // Device A pulled at T and now holds a mark of T. Device B recorded this solve at T-6h with that revision,
    // and uploaded it at T+1h.
    const offline = solve("trip", T - 6 * HOUR);
    const cloud: Stamped[] = [
      { solve: solve("known", T - HOUR), syncedAt: T - HOUR },
      { solve: offline, syncedAt: T + HOUR },
    ];
    const since = pullSince(T, T - HOUR, T - HOUR, T + 2 * HOUR)!;
    const pulled = pulledSince(cloud, since);
    expect(pulled.map((s) => s.id)).toEqual(["trip"]);
    // A revision-based filter would have missed it.
    expect(offline.updatedAt).toBeLessThan(T - 2 * 60_000);

    const deviceA: SyncState = { sessions: [session("S", 1)], solves: [solve("known", T - HOUR)], deletions: [] };
    const merged = mergeStates(deviceA, { sessions: [], solves: pulled, deletions: [] });
    expect(merged.solves.map((s) => s.id).sort()).toEqual(["known", "trip"]);
  });

  it("includes an offline deletion uploaded after the mark, whatever its deletedAt", () => {
    const deviceA: SyncState = { sessions: [session("S", 1)], solves: [solve("a", 10)], deletions: [] };
    const remote: SyncState = { sessions: [], solves: [], deletions: [{ id: "a", kind: "solve", deletedAt: T - 6 * HOUR }] };
    expect(planMerge({ ...deviceA, solves: [solve("a", 10)] }, remote).deleteSolveIds).toEqual(["a"]);
  });
});
