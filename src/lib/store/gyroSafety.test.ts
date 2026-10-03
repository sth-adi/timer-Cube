import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deletion, FullSolve, GyroStream, Session } from "@/types";

/**
 * Write safety of the slim in-memory rows. The store holds solves WITHOUT their gyro stream; every
 * edit, delete + undo, import and sync below runs the real solves.ts / sessionStore.ts / sync.ts
 * against a stand-in for Dexie that behaves like it where it matters here (rows are copied in and out
 * like IndexedDB structured clones; `update` merges only the named fields; `put`/`bulkPut` replace
 * the whole row), and then looks at what is STORED: the stream and the turn times must all still be
 * there, byte for byte.
 */
const h = vi.hoisted(() => {
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

  class FakeTable<T extends { id: string }> {
    rows = new Map<string, T>();
    writes = { put: 0, bulkPut: 0, update: 0 };
    get = async (id: string) => clone(this.rows.get(id));
    bulkGet = async (ids: string[]) => ids.map((id) => clone(this.rows.get(id)));
    add = async (row: T) => {
      if (this.rows.has(row.id)) throw new Error("ConstraintError");
      this.rows.set(row.id, clone(row));
    };
    put = async (row: T) => {
      this.writes.put++;
      this.rows.set(row.id, clone(row));
    };
    bulkPut = async (rows: readonly T[]) => {
      this.writes.bulkPut++;
      for (const r of rows) this.rows.set(r.id, clone(r));
    };
    /** Dexie's update: only the named fields change, and a field set to undefined is removed. */
    update = async (id: string, changes: Partial<T>) => {
      this.writes.update++;
      const row = this.rows.get(id);
      if (!row) return 0;
      const next = { ...row } as Record<string, unknown>;
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined) delete next[k];
        else next[k] = clone(v);
      }
      this.rows.set(id, next as T);
      return 1;
    };
    delete = async (id: string) => void this.rows.delete(id);
    bulkDelete = async (ids: string[]) => void ids.forEach((id) => this.rows.delete(id));
    count = async () => this.rows.size;
    toArray = async () => [...this.rows.values()].map(clone);
    private by = (field: string, sort: boolean) => {
      const list = () => {
        const all = [...this.rows.values()].map((r) => clone(r) as Record<string, unknown>);
        return sort ? all.sort((a, b) => (a[field] as number) - (b[field] as number)) : all;
      };
      return list;
    };
    orderBy = (field: string) => ({ each: async (fn: (r: T) => void) => this.by(field, true)().forEach((r) => fn(r as T)), toArray: async () => this.by(field, true)() as T[] });
    where = (field: string) => {
      const match = (pred: (v: unknown) => boolean) => this.by(field, false)().filter((r) => pred(r[field]));
      return {
        equals: (value: unknown) => ({
          each: async (fn: (r: T) => void) => match((v) => v === value).forEach((r) => fn(r as T)),
          toArray: async () => match((v) => v === value) as T[],
          sortBy: async (key: string) => match((v) => v === value).sort((a, b) => (a[key] as number) - (b[key] as number)) as T[],
        }),
        anyOf: (values: unknown[]) => ({ toArray: async () => match((v) => values.includes(v)) as T[] }),
      };
    };
  }

  return {
    solves: new FakeTable<FullSolve>(),
    deletions: new FakeTable<Deletion>(),
    sessions: new FakeTable<Session>(),
    clone,
    exported: [] as { name: string; data: { solves: Array<Record<string, unknown>> } }[],
  };
});

vi.mock("@/lib/db/db", () => ({
  newId: () => `new-${h.solves.rows.size + 1}-${Math.random().toString(36).slice(2, 8)}`,
  ensureDefaultSession: async () => h.sessions.rows.get("s1"),
  db: {
    solves: h.solves,
    deletions: h.deletions,
    sessions: h.sessions,
    transaction: async (_mode: string, ...rest: unknown[]) => (rest[rest.length - 1] as () => Promise<unknown>)(),
  },
}));
vi.mock("@/lib/db/sessions", () => ({
  listSessions: async () => [...h.sessions.rows.values()],
  createSession: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  moveSessionSolves: vi.fn(),
}));
vi.mock("@/lib/store/scrambleStore", () => ({ useScrambleStore: { getState: () => ({ setEvent: async () => {} }) } }));
vi.mock("@/lib/store/settingsStore", () => ({ useSettingsStore: { getState: () => ({ statsScope: "session" }) } }));
vi.mock("@/lib/storage/persist", () => ({ requestPersistentStorage: vi.fn(async () => null) }));
vi.mock("@/lib/utils/sessionExport", async (original) => ({
  ...(await original<typeof import("@/lib/utils/sessionExport")>()),
  downloadJson: (name: string, data: { solves: Array<Record<string, unknown>> }) => void h.exported.push({ name, data }),
}));

const { useSessionStore, resetSessionInitForTests } = await import("./sessionStore");
const { applySyncPayload, readLocalState } = await import("@/lib/db/sync");
const { forEachFullSolveChunk, getFullSolve, getSolveStreams, restoreSolves, slimSolve } = await import("@/lib/db/solves");
const { parseSessionExport } = await import("@/lib/utils/sessionExport");

const store = () => useSessionStore.getState();
const stored = (id: string) => h.solves.rows.get(id);

/** A gyro stream of `n` samples whose numbers differ per solve, so a mix-up between solves would show. */
const stream = (n: number, salt: number): GyroStream => ({
  atMs: Array.from({ length: n }, (_, i) => i * 50),
  qx: Array.from({ length: n }, (_, i) => Math.sin(i + salt) / 3),
  qy: Array.from({ length: n }, (_, i) => Math.cos(i + salt) / 3),
  qz: Array.from({ length: n }, (_, i) => Math.sin(i * 2 + salt) / 3),
  qw: Array.from({ length: n }, (_, i) => 0.5 + Math.cos(i * 2 + salt) / 3),
});

const gyroRow = (id: string, date: number, salt: number): FullSolve => ({
  id,
  sessionId: "s1",
  timeMs: 9_000 + salt,
  penalty: "none",
  scramble: "R U R' U'",
  date,
  updatedAt: date,
  reconstruction: "R U R' U'",
  moveTimestamps: [0, 150, 320, 700],
  rotations: [{ atMs: 400, token: "y" }],
  orientedReconstruction: "y R U R' U'",
  splits: [2_000, 4_000],
  cube: { id: "cube-1", name: "GAN" },
  gyroStream: stream(400, salt),
});
const plainRow = (id: string, date: number): FullSolve => ({ id, sessionId: "s1", timeMs: 12_000, penalty: "none", scramble: "F B", date, updatedAt: date });

/** What the database must still hold for a solve once the edit under test is done: its stream and turn data, untouched. */
function expectHeavyDataIntact(id: string, original: FullSolve) {
  const row = stored(id);
  expect(row, `${id} is stored`).toBeDefined();
  expect(row?.gyroStream).toEqual(original.gyroStream);
  expect(row?.moveTimestamps).toEqual(original.moveTimestamps);
  expect(row?.rotations).toEqual(original.rotations);
  expect(row?.orientedReconstruction).toEqual(original.orientedReconstruction);
  expect(row?.hasGyro, "the in-memory marker is never stored").toBeUndefined();
}

let g1: FullSolve;
let g2: FullSolve;

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => "1", setItem: () => {}, removeItem: () => {} });
  for (const t of [h.solves, h.deletions, h.sessions]) t.rows.clear();
  h.exported.length = 0;
  h.sessions.rows.set("s1", { id: "s1", name: "Session 1", event: "333", createdAt: 0, order: 0, updatedAt: 0 });
  g1 = gyroRow("g1", 1_000, 1);
  g2 = gyroRow("g2", 2_000, 2);
  for (const r of [g1, g2, plainRow("p1", 3_000)]) h.solves.rows.set(r.id, h.clone(r));
  useSessionStore.setState({ saveError: null, lastPB: null, loaded: false, undoStack: [] });
  resetSessionInitForTests();
  await store().init();
});

describe("the in-memory rows", () => {
  it("carry no gyro stream, only a marker for it", () => {
    for (const list of [store().solves, store().allSolves]) {
      const g = list.find((s) => s.id === "g1")!;
      expect("gyroStream" in g).toBe(false);
      expect(g.hasGyro).toBe(true);
      expect(g.moveTimestamps).toEqual(g1.moveTimestamps);
      expect(list.find((s) => s.id === "p1")!.hasGyro).toBeUndefined();
    }
    // Not a trace of the stream's numbers anywhere in what the store holds.
    expect(JSON.stringify(store().allSolves)).not.toContain(String(g1.gyroStream!.qx[7]));
  });

  it("are slimmed the same way when a solve is recorded, and the stream still lands on disk", async () => {
    const live = stream(120, 9);
    const id = (await store().recordSolve(8_000, "L R", undefined, undefined, "L R", undefined, undefined, [0, 100], { rotations: [], orientedReconstruction: "L R", stream: live }))!;
    const memory = store().allSolves.find((s) => s.id === id)!;
    expect("gyroStream" in memory).toBe(false);
    expect(memory.hasGyro).toBe(true);
    expect(store().solves.find((s) => s.id === id)).toBe(memory);
    expect(stored(id)?.gyroStream).toEqual(live);
    expect(stored(id)?.hasGyro).toBeUndefined();
  });

  it("a solve recorded without a stream has no marker", async () => {
    const id = (await store().recordSolve(8_000, "L R"))!;
    expect(store().allSolves.find((s) => s.id === id)!.hasGyro).toBeUndefined();
  });

  it("slimSolve drops the stream and nothing else", () => {
    const { gyroStream, ...rest } = g1;
    expect(gyroStream).toBeDefined();
    expect(slimSolve(g1)).toEqual({ ...rest, hasGyro: true });
    expect(slimSolve(plainRow("x", 1))).toEqual(plainRow("x", 1));
  });
});

describe("edits never touch the stored stream or turn data", () => {
  it("a penalty edit (+2, then DNF, then cleared)", async () => {
    await store().setPenalty("g1", "plus2");
    expect(stored("g1")?.penalty).toBe("plus2");
    expectHeavyDataIntact("g1", g1);
    await store().setPenalty("g1", "dnf");
    await store().setPenalty("g1", "none");
    expect(stored("g1")?.penalty).toBe("none");
    expectHeavyDataIntact("g1", g1);
    expectHeavyDataIntact("g2", g2);
    expect(h.solves.writes.put + h.solves.writes.bulkPut, "edits are partial updates, never whole-row puts").toBe(0);
  });

  it("a comment edit", async () => {
    await store().setComment("g1", "good cross");
    expect(stored("g1")?.comment).toBe("good cross");
    expectHeavyDataIntact("g1", g1);
    expect(store().allSolves.find((s) => s.id === "g1")).toMatchObject({ comment: "good cross", hasGyro: true });
  });

  it("a bulk edit (penalty and practice tag, then the tag removed)", async () => {
    await store().updateSolves(["g1", "g2", "p1"], { penalty: "plus2", event: "oh" });
    for (const [id, original] of [["g1", g1], ["g2", g2]] as const) {
      expect(stored(id)).toMatchObject({ penalty: "plus2", event: "oh" });
      expectHeavyDataIntact(id, original);
    }
    await store().updateSolves(["g1", "g2"], { event: null });
    expect(stored("g1")?.event).toBeUndefined();
    expectHeavyDataIntact("g1", g1);
    expectHeavyDataIntact("g2", g2);
    expect(h.solves.writes.put + h.solves.writes.bulkPut).toBe(0);
  });

  it("a reconstruction save", async () => {
    await store().saveReconstruction("g1", "R U R' U' F");
    expect(stored("g1")?.reconstruction).toBe("R U R' U' F");
    expectHeavyDataIntact("g1", g1);
    expect(store().allSolves.find((s) => s.id === "g1")?.hasGyro).toBe(true);
  });

  it("edits stack: every kind in turn, then a reload still reads the whole row", async () => {
    await store().setPenalty("g2", "plus2");
    await store().setComment("g2", "x");
    await store().saveReconstruction("g2", "R U");
    await store().updateSolves(["g2"], { event: "bld" });
    expectHeavyDataIntact("g2", g2);
    expect(await getSolveStreams("g2")).toEqual(g2.gyroStream);
    expect((await getFullSolve("g2"))?.moveTimestamps).toEqual(g2.moveTimestamps);
  });
});

describe("delete and undo", () => {
  it("puts the stored row back whole, stream and turn data included", async () => {
    await store().removeSolve("g1");
    expect(stored("g1")).toBeUndefined();
    expect(h.deletions.rows.has("g1")).toBe(true);
    // The one copy of the stream left is in the undo batch — as stored, not as shown.
    expect(store().undoStack.at(-1)?.solves[0].gyroStream).toEqual(g1.gyroStream);

    await store().undoRemove();
    expectHeavyDataIntact("g1", g1);
    expect(h.deletions.rows.has("g1")).toBe(false);
    const back = store().allSolves.find((s) => s.id === "g1")!;
    expect("gyroStream" in back).toBe(false);
    expect(back.hasGyro).toBe(true);
    expect(store().solves.find((s) => s.id === "g1")).toBeDefined();
  });

  it("a bulk delete and one undo restore every row in the batch", async () => {
    await store().removeSolves(["g1", "g2", "p1"]);
    expect(h.solves.rows.size).toBe(0);
    await store().undoRemove();
    expect(h.solves.rows.size).toBe(3);
    expectHeavyDataIntact("g1", g1);
    expectHeavyDataIntact("g2", g2);
    expect(stored("p1")?.gyroStream).toBeUndefined();
  });

  it("delete, edit another solve, undo", async () => {
    await store().removeSolve("g1");
    await store().setPenalty("g2", "dnf");
    await store().undoRemove();
    expectHeavyDataIntact("g1", g1);
    expectHeavyDataIntact("g2", g2);
  });

  it("restoreSolves refuses a slimmed in-memory row instead of writing it over the stored one", async () => {
    const slim = store().allSolves.find((s) => s.id === "g1")!;
    await expect(restoreSolves([slim as unknown as FullSolve])).rejects.toThrow(/stored rows/);
    expectHeavyDataIntact("g1", g1);
  });
});

describe("import", () => {
  it("a newer file copy without a stream or turn times does not erase what is stored", async () => {
    const [row] = parseSessionExport({ solves: [{ id: "g1", timeMs: 9_500, penalty: "plus2", scramble: g1.scramble, date: g1.date, updatedAt: 9_999_999_999_999 }] });
    const result = await store().importRowsIntoActiveSession([row]);
    expect(result.updated).toBe(1);
    expect(stored("g1")).toMatchObject({ timeMs: 9_500, penalty: "plus2" });
    expectHeavyDataIntact("g1", g1);
    expect(store().allSolves.find((s) => s.id === "g1")?.hasGyro).toBe(true);
  });

  it("a file that carries its own stream replaces it", async () => {
    const theirs = stream(50, 77);
    const [row] = parseSessionExport({ solves: [{ id: "g1", timeMs: 9_500, penalty: "none", scramble: g1.scramble, date: g1.date, updatedAt: 9_999_999_999_999, gyroStream: theirs }] });
    await store().importRowsIntoActiveSession([row]);
    expect(stored("g1")?.gyroStream).toEqual(theirs);
  });
});

describe("export and backup read the database, not the slim rows", () => {
  it("exporting the session carries every stream", async () => {
    await store().exportActiveSession();
    const { solves } = h.exported[0].data;
    expect(solves.find((s) => s.id === "g1")?.gyroStream).toEqual(g1.gyroStream);
    expect(solves.find((s) => s.id === "g2")?.moveTimestamps).toEqual(g2.moveTimestamps);
  });

  it("the sync/backup read hands out full rows while the store holds slim ones", async () => {
    const { solves } = await readLocalState();
    expect(solves.find((s) => s.id === "g1")?.gyroStream).toEqual(g1.gyroStream);
    expect("gyroStream" in store().allSolves.find((s) => s.id === "g1")!).toBe(false);
  });
});

describe("sync merge", () => {
  const remoteEdit = (row: FullSolve, over: Partial<FullSolve>): FullSolve => ({ ...h.clone(row), updatedAt: Date.now() + 100_000, ...over });

  it("a newer copy from another device that carries the stream keeps it, and later local edits still leave it alone", async () => {
    await store().setPenalty("g1", "plus2"); // an in-memory-driven edit first
    const incoming = remoteEdit(g1, { penalty: "dnf", comment: "from phone" });
    await applySyncPayload({ sessions: [], solves: [incoming], deletions: [] });
    expect(stored("g1")).toMatchObject({ penalty: "dnf", comment: "from phone" });
    expectHeavyDataIntact("g1", g1);
    await store().refreshFromDb();
    expect(store().allSolves.find((s) => s.id === "g1")).toMatchObject({ penalty: "dnf", hasGyro: true });
    await store().setComment("g1", "mine");
    expectHeavyDataIntact("g1", g1);
  });

  it("a cloud copy that predates the stream columns can win the merge without wiping them", async () => {
    const { gyroStream, moveTimestamps, ...bare } = remoteEdit(g1, { penalty: "plus2" });
    expect(gyroStream && moveTimestamps).toBeTruthy();
    await applySyncPayload({ sessions: [], solves: [bare], deletions: [] }, { carryLocalOnlyFields: true });
    expect(stored("g1")?.penalty).toBe("plus2");
    expectHeavyDataIntact("g1", g1);
  });

  it("an older copy changes nothing", async () => {
    await store().setComment("g2", "newer here");
    await applySyncPayload({ sessions: [], solves: [remoteEdit(g2, { comment: "stale", updatedAt: 1 })], deletions: [] });
    expect(stored("g2")?.comment).toBe("newer here");
    expectHeavyDataIntact("g2", g2);
  });

  it("a deletion from another device removes the row and an undo-style restore elsewhere brings the stream back", async () => {
    await applySyncPayload({ sessions: [], solves: [], deletions: [{ id: "g1", kind: "solve", deletedAt: 9_000_000 }] });
    expect(stored("g1")).toBeUndefined();
    await applySyncPayload({ sessions: [], solves: [remoteEdit(g1, { updatedAt: 9_000_001 })], deletions: [] });
    expectHeavyDataIntact("g1", g1);
  });
});

describe("late-start repair, which has to shift the stored stream too", () => {
  it("shifts the stream on disk and keeps the in-memory row slim", async () => {
    const late: FullSolve = { ...gyroRow("late", 4_000, 4), moveTimestamps: [-500, 0, 400], timeMs: 5_000, splits: undefined, rotations: undefined };
    h.solves.rows.set("late", h.clone(late));
    const flag = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => flag.get(k) ?? null, setItem: (k: string, v: string) => void flag.set(k, v) });
    resetSessionInitForTests();
    await store().init();
    expect(stored("late")?.moveTimestamps).toEqual([0, 500, 900]);
    expect(stored("late")?.timeMs).toBe(5_500);
    expect(stored("late")?.gyroStream?.atMs).toEqual(late.gyroStream!.atMs.map((t) => t + 500));
    expect(stored("late")?.gyroStream?.qx).toEqual(late.gyroStream!.qx);
    const memory = store().allSolves.find((s) => s.id === "late")!;
    expect("gyroStream" in memory).toBe(false);
    expect(memory).toMatchObject({ timeMs: 5_500, hasGyro: true });
    // Solves that were fine are untouched.
    expectHeavyDataIntact("g1", g1);
  });
});

describe("on-demand reads", () => {
  it("getFullSolve and getSolveStreams read the stored row", async () => {
    expect((await getFullSolve("g1"))?.gyroStream).toEqual(g1.gyroStream);
    expect(await getSolveStreams("g1")).toEqual(g1.gyroStream);
    expect(await getSolveStreams("p1")).toBeUndefined();
    expect(await getSolveStreams("nope")).toBeUndefined();
  });

  it("forEachFullSolveChunk hands out full rows in chunks, skips vanished ids and honours an abort", async () => {
    const seen: string[][] = [];
    await forEachFullSolveChunk(["g1", "gone", "g2", "p1"], (rows) => void seen.push(rows.map((r) => r.id)), { chunkSize: 2 });
    expect(seen).toEqual([["g1"], ["g2", "p1"]]);

    const signal = { aborted: false };
    const count = vi.fn(() => void (signal.aborted = true));
    await forEachFullSolveChunk(["g1", "g2", "p1"], count, { chunkSize: 1, signal });
    expect(count).toHaveBeenCalledTimes(1);

    let withStream = 0;
    await forEachFullSolveChunk(["g1", "g2"], (rows) => void (withStream += rows.filter((r) => r.gyroStream).length));
    expect(withStream).toBe(2);
  });
});
