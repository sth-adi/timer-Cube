import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deletion, Session, FullSolve } from "@/types";
import { computeSessionStats } from "@/lib/stats/stats";

/**
 * An in-memory stand-in for the three Dexie tables a sync touches (counting how it reads the solves
 * table), and for the Supabase client — enough to run a whole syncWithCloud and see what it reads,
 * writes and publishes.
 */
const h = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  solves: new Map<string, FullSolve>(),
  deletions: new Map<string, Deletion>(),
  reads: { toArray: 0, bulkGet: 0, anyOf: 0 },
  cloud: { sessions: [] as unknown[], solves: [] as unknown[], deletions: [] as unknown[] },
  upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
}));

vi.mock("./db", () => ({
  db: {
    transaction: async (_mode: string, ...rest: unknown[]) => (rest[rest.length - 1] as () => Promise<unknown>)(),
    sessions: {
      toArray: async () => [...h.sessions.values()],
      bulkPut: async (rows: Session[]) => void rows.forEach((r) => h.sessions.set(r.id, r)),
      bulkDelete: async (ids: string[]) => void ids.forEach((id) => h.sessions.delete(id)),
    },
    deletions: {
      toArray: async () => [...h.deletions.values()],
      bulkPut: async (rows: Deletion[]) => void rows.forEach((r) => h.deletions.set(r.id, r)),
    },
    solves: {
      count: async () => h.solves.size,
      toArray: async () => {
        h.reads.toArray++;
        return [...h.solves.values()];
      },
      bulkGet: async (ids: string[]) => {
        h.reads.bulkGet++;
        return ids.map((id) => h.solves.get(id));
      },
      bulkPut: async (rows: FullSolve[]) => void rows.forEach((r) => h.solves.set(r.id, r)),
      bulkDelete: async (ids: string[]) => void ids.forEach((id) => h.solves.delete(id)),
      where: (field: string) => ({
        anyOf: (values: string[]) => ({
          toArray: async () => {
            h.reads.anyOf++;
            expect(field).toBe("sessionId");
            return [...h.solves.values()].filter((s) => values.includes(s.sessionId));
          },
        }),
      }),
    },
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: "sessions" | "solves" | "deletions" | "public_stats") => ({
      select: () => {
        const chain = {
          eq: () => chain,
          gt: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (resolve: (v: unknown) => unknown) => resolve({ data: table === "public_stats" ? [] : h.cloud[table], error: null }),
        };
        return chain;
      },
      upsert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        h.upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return { error: null };
      },
    }),
  }),
}));

import { recoveredSessionId } from "./merge";
import { applySyncPayload } from "./sync";
import { publicStatsFor, pullAll, pushAll, syncWithCloud } from "./cloudSync";

const USER = "user-1";

const session = (id: string, over: Partial<Session> = {}): Session => ({ id, name: id, event: "333", createdAt: 1, order: 0, updatedAt: 1, ...over });
const solve = (id: string, t: number, over: Partial<FullSolve> = {}): FullSolve => ({
  id,
  sessionId: "S",
  timeMs: 10_000,
  penalty: "none",
  scramble: "R U",
  date: t,
  updatedAt: t,
  ...over,
});

/** A cloud row for a solve, as Supabase sends it. */
const cloudSolve = (s: FullSolve) => ({
  id: s.id,
  user_id: USER,
  session_id: s.sessionId,
  time_ms: s.timeMs,
  penalty: s.penalty,
  scramble: s.scramble,
  date: s.date,
  comment: null,
  splits: null,
  event: s.event ?? null,
  reconstruction: null,
  heart_rate: null,
  cross_ms: null,
  move_timestamps: null,
  rotations: null,
  oriented_reconstruction: null,
  gyro_stream: null,
  updated_at: s.updatedAt ?? null,
});
const cloudSession = (s: Session) => ({ id: s.id, user_id: USER, name: s.name, event: s.event, created_at: s.createdAt, order: s.order, updated_at: s.updatedAt ?? null });

function seedLocal(sessions: Session[], solves: FullSolve[], deletions: Deletion[] = []) {
  for (const s of sessions) h.sessions.set(s.id, s);
  for (const s of solves) h.solves.set(s.id, s);
  for (const d of deletions) h.deletions.set(d.id, d);
}

/** localStorage, for the push/pull marks and the data owner. */
function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    },
  });
  return data;
}

beforeEach(() => {
  h.sessions.clear();
  h.solves.clear();
  h.deletions.clear();
  h.reads.toArray = h.reads.bulkGet = h.reads.anyOf = 0;
  h.cloud.sessions = [];
  h.cloud.solves = [];
  h.cloud.deletions = [];
  h.upserts.length = 0;
  stubStorage();
});

/** 40 solves of one session and a few of another, so a handful of pulled rows is a small part of the table. */
function bigLocalTable(): FullSolve[] {
  return [...Array.from({ length: 40 }, (_, i) => solve(`a${i}`, 100 + i)), ...Array.from({ length: 5 }, (_, i) => solve(`t${i}`, 200 + i, { sessionId: "T" }))];
}

describe("applySyncPayload: reads only the solves a payload can touch", () => {
  it("looks up just the pulled ids, never scanning the table, when the payload is a small part of it", async () => {
    seedLocal([session("S"), session("T")], bigLocalTable());
    const out = await applySyncPayload({ sessions: [], solves: [solve("a3", 500, { penalty: "plus2" }), solve("new", 501)], deletions: [] });
    expect(h.reads.toArray).toBe(0);
    expect(h.reads.bulkGet).toBe(1);
    expect(out.solves).toBeNull();
    expect(out.result).toEqual({ addedSessions: 0, addedSolves: 1, updated: 1, removed: 0 });
    expect(h.solves.get("a3")?.penalty).toBe("plus2");
    expect(h.solves.has("new")).toBe(true);
    expect(h.solves.size).toBe(46);
  });

  it("reads the table whole, once, when the payload is a big part of it — and hands back what it left there", async () => {
    seedLocal([session("S")], [solve("a", 10), solve("b", 20), solve("c", 30)]);
    const out = await applySyncPayload({ sessions: [], solves: [solve("b", 25, { penalty: "dnf" }), solve("d", 40)], deletions: [{ id: "c", kind: "solve", deletedAt: 50 }] });
    expect(h.reads.toArray).toBe(1);
    expect(out.solves?.map((s) => s.id).sort()).toEqual(["a", "b", "d"]);
    expect(out.solves).toHaveLength(h.solves.size);
    expect(out.solves?.find((s) => s.id === "b")?.penalty).toBe("dnf");
  });

  it("a deletion in the payload removes a local solve found by id", async () => {
    seedLocal([session("S")], bigLocalTable());
    const out = await applySyncPayload({ sessions: [], solves: [], deletions: [{ id: "a7", kind: "solve", deletedAt: 999 }] });
    expect(h.reads.toArray).toBe(0);
    expect(out.result.removed).toBe(1);
    expect(h.solves.has("a7")).toBe(false);
    expect(h.deletions.get("a7")).toEqual({ id: "a7", kind: "solve", deletedAt: 999 });
  });

  it("a session deletion in the payload still reaches the solves filed under it (found by session, not scanned for)", async () => {
    seedLocal([session("S"), session("T")], bigLocalTable());
    const out = await applySyncPayload({ sessions: [], solves: [], deletions: [{ id: "T", kind: "session", deletedAt: 1000 }] });
    expect(h.reads.toArray).toBe(0);
    expect(h.reads.anyOf).toBe(1);
    expect([...h.solves.values()].filter((s) => s.sessionId === "T")).toHaveLength(0);
    expect(h.solves.size).toBe(40);
    expect(h.sessions.has("T")).toBe(false);
    expect(out.result.removed).toBe(6);
  });

  it("a local solve newer than the pulled session deletion is re-homed into Recovered, not deleted", async () => {
    seedLocal([session("S"), session("T")], [...bigLocalTable(), solve("trip", 2000, { sessionId: "T" })]);
    await applySyncPayload({ sessions: [], solves: [], deletions: [{ id: "T", kind: "session", deletedAt: 1000 }] });
    const rid = recoveredSessionId("T");
    expect(h.solves.get("trip")).toMatchObject({ sessionId: rid, updatedAt: 2001, date: 2000 });
    expect([...h.solves.values()].filter((s) => s.sessionId === "T")).toHaveLength(0);
    expect(h.sessions.get(rid)).toMatchObject({ name: "Recovered (T)", event: "333" });
    expect(h.sessions.has("T")).toBe(false);
    // Merging the same deletion again is a no-op.
    const again = await applySyncPayload({ sessions: [], solves: [], deletions: [{ id: "T", kind: "session", deletedAt: 1000 }] });
    expect(again.result).toEqual({ addedSessions: 0, addedSolves: 0, updated: 0, removed: 0 });
  });

  it("the targeted and the whole-table merge end in the same state", async () => {
    const run = async (extraSolves: FullSolve[]) => {
      h.sessions.clear();
      h.solves.clear();
      h.deletions.clear();
      seedLocal([session("S"), session("T")], [...bigLocalTable(), solve("trip", 2000, { sessionId: "T" })], [{ id: "gone", kind: "solve", deletedAt: 5 }]);
      const payload = {
        sessions: [session("U")],
        solves: [solve("a1", 900, { penalty: "dnf" }), solve("gone", 3), ...extraSolves],
        deletions: [{ id: "T", kind: "session" as const, deletedAt: 1000 }, { id: "a2", kind: "solve" as const, deletedAt: 5000 }],
      };
      const out = await applySyncPayload(payload);
      return { out, state: JSON.stringify([[...h.sessions.values()], [...h.solves.values()].sort((x, y) => x.id.localeCompare(y.id)), [...h.deletions.values()]].map((xs) => [...xs].sort((x, y) => (x as { id: string }).id.localeCompare((y as { id: string }).id)))) };
    };
    h.reads.toArray = 0;
    const small = await run([]);
    expect(h.reads.toArray).toBe(0);
    // Enough extra rows to tip it into reading the whole table.
    const many = Array.from({ length: 30 }, (_, i) => solve(`extra${i}`, 800 + i, { sessionId: "U" }));
    const big = await run(many);
    expect(h.reads.toArray).toBe(1);
    expect(big.out.result.removed).toBe(small.out.result.removed);
    expect(big.out.result.updated).toBe(small.out.result.updated);
    // Same table apart from the extra rows.
    const strip = (state: string) => (JSON.parse(state) as [unknown[], { id: string }[], unknown[]]).map((xs) => xs.filter((x) => !(x as { id: string }).id.startsWith("extra")));
    expect(strip(big.state)).toEqual(strip(small.state));
  });

  it("carryLocalOnlyFields puts the local cube back on a cloud row that lacks it, found by id", async () => {
    seedLocal([session("S")], [...bigLocalTable(), solve("c1", 300, { cube: { id: "mac:AA", name: "GAN" } })]);
    const out = await applySyncPayload({ sessions: [], solves: [solve("c1", 300)], deletions: [] }, { carryLocalOnlyFields: true });
    expect(h.reads.toArray).toBe(0);
    expect(out.result.updated).toBe(0);
    expect(h.solves.get("c1")?.cube).toEqual({ id: "mac:AA", name: "GAN" });
    // Without the option the cloud's copy (no cube) could win the tie by content.
  });
});

describe("a cloud sync reads the whole solves table once", () => {
  const marks = (extra: Record<string, string> = {}) => ({
    [`cube-timer-cloud-pushed-at:${USER}`]: String(Date.now() - 3_600_000),
    [`cube-timer-cloud-synced-mark:${USER}`]: String(Date.now() - 3_600_000),
    [`cube-timer-cloud-full-pull-at:${USER}`]: String(Date.now() - 86_400_000),
    ...extra,
  });

  it("incremental pull: one scan (the push's), shared with the public stats", async () => {
    stubStorage(marks());
    const local = bigLocalTable();
    seedLocal([session("S"), session("T")], local);
    h.cloud.solves = [cloudSolve(solve("from-phone", Date.now()))];
    const result = await syncWithCloud(USER, { publishStatsAs: "alice" });
    expect(h.reads.toArray).toBe(1);
    expect(result.addedSolves).toBe(1);
    const pushedSolves = h.upserts.filter((u) => u.table === "solves").flatMap((u) => u.rows);
    // Only the two sessions' worth of fresh solves — nothing the cloud already has.
    expect(pushedSolves.every((r) => r.id !== "from-phone")).toBe(true);
    const stats = h.upserts.find((u) => u.table === "public_stats")!.rows[0];
    expect(stats).toMatchObject({ user_id: USER, username: "alice", total_solves: 46 });
  });

  it("full pull that has to read the table for the merge: still one scan in all", async () => {
    stubStorage({ [`cube-timer-cloud-pushed-at:${USER}`]: String(Date.now()) });
    seedLocal([session("S")], [solve("a", 10), solve("b", 20)]);
    h.cloud.sessions = [cloudSession(session("S"))];
    h.cloud.solves = [cloudSolve(solve("a", 10)), cloudSolve(solve("c", 30))];
    await syncWithCloud(USER, { publishStatsAs: "alice" });
    expect(h.reads.toArray).toBe(1);
    // "b" is local only, so it goes up; "a" is identical in the cloud and "c" came from it.
    const pushed = h.upserts.filter((u) => u.table === "solves").flatMap((u) => u.rows.map((r) => r.id));
    expect(pushed).toEqual(["b"]);
    expect(h.upserts.find((u) => u.table === "public_stats")!.rows[0]).toMatchObject({ total_solves: 3 });
  });

  it("without a username no stats are published", async () => {
    stubStorage(marks());
    seedLocal([session("S")], [solve("a", 10)]);
    await syncWithCloud(USER);
    expect(h.upserts.some((u) => u.table === "public_stats")).toBe(false);
  });

  it("pullAll hands pushAll the table only when the merge read it whole", async () => {
    stubStorage(marks());
    seedLocal([session("S"), session("T")], bigLocalTable());
    const pulled = await pullAll(USER);
    expect(pulled.solves).toBeNull();
    expect(h.reads.toArray).toBe(0);
    const state = await pushAll(USER, pulled.cloudRevisions, pulled.complete, pulled.solves);
    expect(h.reads.toArray).toBe(1);
    expect(state?.solves).toHaveLength(45);
    // A second push given the first's read doesn't scan again.
    await pushAll(USER, pulled.cloudRevisions, pulled.complete, state?.solves);
    expect(h.reads.toArray).toBe(1);
  });

  it("an offline solve recorded after another device deleted its session survives a sync, re-homed, and is pushed under the new session before anything is deleted", async () => {
    stubStorage(marks());
    const now = Date.now();
    seedLocal([session("S"), session("keep")], [solve("old", now - 7_200_000), solve("trip", now)]);
    h.cloud.deletions = [{ user_id: USER, id: "S", kind: "session", deleted_at: now - 1000, synced_at: "2026-10-04T10:00:00Z" }];
    await syncWithCloud(USER);
    const rid = recoveredSessionId("S");
    expect(h.solves.has("old")).toBe(false);
    expect(h.solves.get("trip")).toMatchObject({ sessionId: rid, updatedAt: now + 1 });
    expect(h.sessions.has("S")).toBe(false);
    expect(h.sessions.get(rid)?.name).toBe("Recovered (S)");
    const tables = h.upserts.map((u) => u.table);
    expect(tables.indexOf("sessions")).toBeLessThan(tables.indexOf("solves"));
    const sessionsPushed = h.upserts.find((u) => u.table === "sessions")!.rows.map((r) => r.id);
    expect(sessionsPushed).toContain(rid);
    const solvesPushed = h.upserts.filter((u) => u.table === "solves").flatMap((u) => u.rows);
    expect(solvesPushed).toHaveLength(1);
    expect(solvesPushed[0]).toMatchObject({ id: "trip", session_id: rid, updated_at: now + 1 });
    const deletionsAt = tables.indexOf("deletions");
    if (deletionsAt >= 0) expect(deletionsAt).toBeGreaterThan(tables.lastIndexOf("solves"));
  });
});

describe("publicStatsFor", () => {
  // Dates 1..6; times chosen so the best ao5 over date order (11000) differs from any scrambled order.
  const times = [9000, 10_000, 11_000, 12_000, 13_000, 50_000];
  const series = (sessionId: string, extra: Partial<FullSolve> = {}): FullSolve[] => times.map((t, i) => solve(`${sessionId}-${i}`, i + 1, { sessionId, timeMs: t, ...extra }));
  const shuffled = (xs: FullSolve[]) => [3, 0, 5, 2, 4, 1].map((i) => xs[i]);

  it("computes ao5 over the solves in date order, whatever order they come in", () => {
    const s3 = session("S3");
    const rows = series("S3");
    expect(publicStatsFor([s3], rows).bestAo5).toBe(11_000);
    expect(publicStatsFor([s3], shuffled(rows)).bestAo5).toBe(11_000);
    expect(publicStatsFor([s3], [...rows].reverse()).bestAo5).toBe(11_000);
    // The scrambled order really would have given another answer (the old bug).
    expect(computeSessionStats(shuffled(rows)).bestAo5).not.toBe(11_000);
  });

  it("counts only ordinary solves from 3x3 sessions", () => {
    const sessions = [session("S3"), session("S2", { event: "222" }), session("S4", { event: "444" })];
    const rows = [
      ...series("S3"),
      // A 2x2 and a 4x4 history: far quicker/slower, would wreck every figure if mixed in.
      ...series("S2", { timeMs: 1000 }),
      ...series("S4", { timeMs: 90_000 }),
      // One-handed, feet and blind solves inside the 3x3 session.
      solve("oh", 7, { sessionId: "S3", timeMs: 500, event: "oh" }),
      solve("bld", 8, { sessionId: "S3", timeMs: 400, event: "bld" }),
      // A solve whose session is unknown can't be shown to be 3x3.
      solve("orphan", 9, { sessionId: "gone", timeMs: 300 }),
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    const stats = publicStatsFor(sessions, rows);
    expect(stats.best).toBe(9000);
    expect(stats.bestAo5).toBe(11_000);
    expect(stats.bestAo12).toBeNull();
    expect(stats.solveCount).toBe(6);
  });

  it("windows run across 3x3 sessions in date order (a 2x2 session in between doesn't break them up)", () => {
    const sessions = [session("A"), session("B"), session("X", { event: "222" })];
    const rows = [
      solve("a1", 1, { sessionId: "A", timeMs: 9000 }),
      solve("x1", 2, { sessionId: "X", timeMs: 99_000 }),
      solve("b1", 3, { sessionId: "B", timeMs: 10_000 }),
      solve("a2", 4, { sessionId: "A", timeMs: 11_000 }),
      solve("b2", 5, { sessionId: "B", timeMs: 12_000 }),
      solve("a3", 6, { sessionId: "A", timeMs: 13_000 }),
    ];
    expect(publicStatsFor(sessions, [rows[5], rows[1], rows[3], rows[0], rows[4], rows[2]]).bestAo5).toBe(11_000);
  });

  it("is empty-safe", () => {
    expect(publicStatsFor([], []).best).toBeNull();
    expect(publicStatsFor([session("S3")], []).solveCount).toBe(0);
  });
});
