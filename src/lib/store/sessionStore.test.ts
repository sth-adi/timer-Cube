import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, Solve } from "@/types";

/** The store against an in-memory stand-in for Dexie: what it reads back is what counts. */
const rows: Solve[] = [];
const calls = { getAll: 0, getSession: 0, bulkDelete: 0, failAdd: false, failRestore: false, failOpen: false, failBulkDelete: false };
/** Holds the database "opening" until released; `afterGetAll` runs once inside a getAllSolves read, after its snapshot. */
const hooks: { openGate: Promise<void> | null; afterGetAll: (() => Promise<void>) | null } = { openGate: null, afterGetAll: null };
let clock = 1_000;
const s1: Session = { id: "s1", name: "Session 1", event: "333", createdAt: 0, order: 0, updatedAt: 0 };
const sessionRows: Session[] = [s1];
const settings = { statsScope: "session" as "session" | "all" };

vi.mock("@/lib/db/db", () => ({
  ensureDefaultSession: async () => {
    if (calls.failOpen) throw new Error("UnknownError: backing store");
    await hooks.openGate;
    return { id: "s1", name: "Session 1", event: "333", createdAt: 0, order: 0, updatedAt: 0 };
  },
}));
vi.mock("@/lib/db/sessions", () => ({
  listSessions: async () => [...sessionRows],
  createSession: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  moveSessionSolves: vi.fn(),
}));
vi.mock("@/lib/db/solves", () => ({
  addSolve: async (input: { sessionId: string; timeMs: number; scramble: string }) => {
    if (calls.failAdd) throw new Error("QuotaExceededError");
    const solve: Solve = { id: `n${rows.length}`, sessionId: input.sessionId, timeMs: input.timeMs, scramble: input.scramble, penalty: "none", date: ++clock, updatedAt: clock };
    rows.push(solve);
    return solve;
  },
  updateSolve: async (id: string, changes: Partial<Solve>) => {
    const i = rows.findIndex((r) => r.id === id);
    rows[i] = { ...rows[i], ...changes, updatedAt: ++clock };
    return clock;
  },
  updateSolvesBulk: async (ids: string[], changes: Partial<Solve>) => {
    clock++;
    for (const id of ids) rows[rows.findIndex((r) => r.id === id)] = { ...rows.find((r) => r.id === id)!, ...changes, updatedAt: clock };
    return clock;
  },
  bulkDeleteSolves: async (ids: string[]) => {
    calls.bulkDelete++;
    if (calls.failBulkDelete) throw new Error("QuotaExceededError");
    return ids.flatMap((id) => {
      const i = rows.findIndex((r) => r.id === id);
      return i < 0 ? [] : rows.splice(i, 1);
    });
  },
  restoreSolves: async (list: Solve[]) => {
    if (calls.failRestore) throw new Error("QuotaExceededError");
    const back = list.map((s) => ({ ...s, updatedAt: ++clock }));
    rows.push(...back);
    return back;
  },
  getAllSolves: async () => {
    calls.getAll++;
    const snapshot = [...rows].sort((a, b) => a.date - b.date);
    const hook = hooks.afterGetAll;
    hooks.afterGetAll = null;
    await hook?.();
    return snapshot;
  },
  getSessionSolves: async (id: string) => (calls.getSession++, rows.filter((r) => r.sessionId === id).sort((a, b) => a.date - b.date)),
  importSolves: vi.fn(),
}));
vi.mock("@/lib/store/scrambleStore", () => ({ useScrambleStore: { getState: () => ({ setEvent: async () => {} }) } }));
vi.mock("@/lib/store/settingsStore", () => ({ useSettingsStore: { getState: () => settings } }));
vi.mock("@/lib/storage/persist", () => ({ requestPersistentStorage: vi.fn(async () => null) }));

const { useSessionStore, resetSessionInitForTests, READY_WAIT_MS } = await import("./sessionStore");
const store = () => useSessionStore.getState();
const seed = (id: string, timeMs: number, date: number, extra: Partial<Solve> = {}): Solve => ({ id, sessionId: "s1", timeMs, penalty: "none", scramble: "R U", date, ...extra });

/** A cold start: forgets the first load, then loads again from whatever the "database" holds now. */
async function reinit() {
  resetSessionInitForTests();
  await store().init();
}

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => "1", setItem: () => {}, removeItem: () => {} });
  rows.length = 0;
  rows.push(seed("a", 12_000, 1), seed("b", 11_000, 2, { moveTimestamps: [0, 100] }));
  calls.getAll = 0;
  calls.getSession = 0;
  calls.failAdd = false;
  calls.failRestore = false;
  calls.bulkDelete = 0;
  calls.failOpen = false;
  calls.failBulkDelete = false;
  hooks.openGate = null;
  hooks.afterGetAll = null;
  sessionRows.length = 0;
  sessionRows.push(s1);
  settings.statsScope = "session";
  useSessionStore.setState({ saveError: null, lastPB: null, loaded: false, undoStack: [] });
  await reinit();
});

/** Records each time in turn, returning what lastPB was after each. */
async function record(...times: number[]) {
  const pbs = [];
  for (const t of times) {
    await store().recordSolve(t, "R U");
    pbs.push(store().lastPB);
  }
  return pbs;
}

describe("sessionStore", () => {
  it("init loads the whole history once", async () => {
    expect(calls.getAll).toBe(1);
    expect(calls.getSession).toBe(0);
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("repairs late-start solves once per device, still loading the history once", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    rows.push(seed("late", 8_000, 3, { moveTimestamps: [-2_000, 0, 6_000] }));
    calls.getAll = 0;
    await reinit();
    expect(calls.getAll).toBe(1);
    expect(store().allSolves.find((s) => s.id === "late")).toMatchObject({ timeMs: 10_000, moveTimestamps: [0, 2_000, 8_000] });
    expect(rows.find((r) => r.id === "late")?.timeMs).toBe(10_000);
    rows.push(seed("late2", 8_000, 4, { moveTimestamps: [-1, 5] }));
    await reinit();
    expect(rows.find((r) => r.id === "late2")?.timeMs).toBe(8_000);
  });

  it("recordSolve appends the saved row in memory, returns its id and still flags a PB", async () => {
    calls.getAll = 0;
    const id = await store().recordSolve(9_000, "F B");
    expect(id).toBe("n2");
    expect(calls.getAll + calls.getSession).toBe(0);
    expect(store().solves.at(-1)?.id).toBe(id);
    expect(store().allSolves.at(-1)?.id).toBe(id);
    expect(store().lastPB).toMatchObject({ kind: "single", ms: 9_000 });
  });

  it("a failed write is recorded, not thrown, and adds nothing", async () => {
    calls.failAdd = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(store().recordSolve(9_000, "F B")).resolves.toBeUndefined();
    expect(store().saveError?.message).toBe("QuotaExceededError");
    expect(store().solves).toHaveLength(2);
    store().clearSaveError();
    expect(store().saveError).toBeNull();
  });

  it("edits patch the row in both lists without re-reading", async () => {
    calls.getAll = 0;
    await store().setPenalty("a", "plus2");
    await store().setComment("a", "hi");
    await store().saveReconstruction("b", "R U");
    await store().updateSolves(["a", "b"], { event: "oh" });
    expect(calls.getAll + calls.getSession).toBe(0);
    for (const list of [store().solves, store().allSolves]) {
      expect(list.find((s) => s.id === "a")).toMatchObject({ penalty: "plus2", comment: "hi", event: "oh" });
      expect(list.find((s) => s.id === "b")).toMatchObject({ reconstruction: "R U", event: "oh" });
    }
  });

  it("removing then undoing puts the solves back in date order", async () => {
    await store().removeSolves(["a"]);
    expect(store().allSolves.map((s) => s.id)).toEqual(["b"]);
    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store().allSolves.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("undo walks back through several deletions, newest first, each batch whole", async () => {
    await record(13_000, 14_000, 15_000); // n2, n3, n4
    await store().removeSolves(["a", "n3"]);
    await store().removeSolve("b");
    await store().removeSolve("n4");
    expect(store().undoStack.map((b) => b.solves.map((s) => s.id))).toEqual([["a", "n3"], ["b"], ["n4"]]);
    expect(store().solves.map((s) => s.id)).toEqual(["n2"]);

    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["n2", "n4"]);
    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["b", "n2", "n4"]);
    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b", "n2", "n3", "n4"]);
    expect(store().allSolves.map((s) => s.id)).toEqual(["a", "b", "n2", "n3", "n4"]);
    expect(store().undoStack).toEqual([]);
    expect(store().solves.find((s) => s.id === "n3")?.timeMs).toBe(14_000);
    await store().undoRemove(); // nothing left: a no-op
    expect(store().solves).toHaveLength(5);
  });

  it("two quick presses restore two different batches", async () => {
    await store().removeSolve("a");
    await store().removeSolve("b");
    await Promise.all([store().undoRemove(), store().undoRemove()]);
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store().undoStack).toEqual([]);
  });

  it("undo keeps only the last UNDO_DEPTH deletions", async () => {
    await record(...Array.from({ length: 10 }, (_, i) => 20_000 + i));
    for (const s of [...store().solves]) await store().removeSolve(s.id);
    const ids = store().undoStack.map((b) => b.solves[0].id);
    expect(ids).toEqual(["n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10", "n11"]);
    for (let i = 0; i < 12; i++) await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(ids);
  });

  it("a failed undo keeps the batch to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await store().removeSolve("a");
    await store().removeSolve("b");
    calls.failRestore = true;
    await store().undoRemove();
    expect(store().saveError?.message).toBe("QuotaExceededError");
    expect(store().undoStack.map((b) => b.solves[0].id)).toEqual(["a", "b"]);
    calls.failRestore = false;
    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["b"]);
  });

  it("dismissing forgets the whole undo history", async () => {
    await store().removeSolve("a");
    await store().removeSolve("b");
    store().dismissUndo();
    expect(store().undoStack).toEqual([]);
    await store().undoRemove();
    expect(store().solves).toEqual([]);
  });
});

describe("PB detection", () => {
  it("the first ao5 and ao12 of a session are not PBs, later improvements are", async () => {
    // a=12, b=11 already; slower and slower, so no single or ao5 improves.
    const pbs = await record(13_000, 14_000, 15_000, 16_000, 17_000, 18_000, 19_000, 20_000, 21_000, 22_000);
    expect(pbs).toEqual(Array(10).fill(null));
    expect(store().solves).toHaveLength(12);
    // ao12: drop 11 and 22 -> (11.5 + 13..21) / 10 = 16.45, beating the first ao12 (16.5); not a single PB.
    expect(await record(11_500)).toMatchObject([{ kind: "ao12", ms: 16_450 }]);
  });

  it("an ao5 that beats the session's earlier ao5 is a PB", async () => {
    // First ao5: [12, 11, 13, 14, 15] -> 13. No toast for it.
    expect(await record(13_000, 14_000, 15_000)).toEqual([null, null, null]);
    // [11, 13, 14, 15, 11.5] -> mean(11.5, 13, 14) = 12.83 < 13; 11.5 is no single PB.
    expect(await record(11_500)).toMatchObject([{ kind: "ao5", ms: (11_500 + 13_000 + 14_000) / 3 }]);
  });

  it("the first single of an empty session is not a PB", async () => {
    rows.length = 0;
    await reinit();
    expect(await record(9_000, 8_000)).toMatchObject([null, { kind: "single", ms: 8_000 }]);
  });

  it("under All sessions, records are judged against every session of the event", async () => {
    settings.statsScope = "all";
    sessionRows.push({ ...s1, id: "s2", name: "Older" });
    rows.push(...[5_000, 5_000, 5_000, 5_000, 5_000].map((t, i) => seed(`old${i}`, t, -10 + i, { sessionId: "s2" })));
    await reinit();
    await store().switchSession("s1");
    // Faster than this session's 11s, slower than the older session's 5s; this session's first ao5 is no record either.
    expect(await record(9_000, 9_500, 10_000)).toEqual([null, null, null]);
    expect(await record(4_000)).toMatchObject([{ kind: "single", ms: 4_000 }]);
  });

  it("ignores other events' sessions under All sessions", async () => {
    settings.statsScope = "all";
    sessionRows.push({ ...s1, id: "s2", name: "2x2", event: "222" });
    rows.push(seed("fast", 2_000, -1, { sessionId: "s2" }));
    await reinit();
    await store().switchSession("s1");
    expect(await record(9_000)).toMatchObject([{ kind: "single", ms: 9_000 }]);
  });
});

/** The state of a page that hasn't finished loading: no open session. */
const notReady = () => {
  resetSessionInitForTests();
  useSessionStore.setState({ activeSessionId: null, loaded: false, solves: [], allSolves: [], sessions: [] });
};

describe("init", () => {
  it("runs once however often it is called, and shares the promise", async () => {
    calls.getAll = 0;
    const first = store().init();
    expect(store().init()).toBe(first);
    await first;
    await store().init();
    expect(calls.getAll).toBe(0); // beforeEach already loaded; nothing read again
    resetSessionInitForTests();
    const [a, b] = [store().init(), store().init()];
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(calls.getAll).toBe(1);
  });

  it("tells the person when the database won't open, instead of rejecting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    notReady();
    calls.failOpen = true;
    await expect(store().init()).resolves.toBeUndefined();
    expect(store().loaded).toBe(false);
    expect(store().saveError).toMatchObject({ kind: "open", message: "UnknownError: backing store" });
  });

  it("tries again on the next call after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    notReady();
    calls.failOpen = true;
    await store().init();
    calls.failOpen = false;
    await store().init();
    expect(store().loaded).toBe(true);
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("recordSolve before the store is ready", () => {
  it("waits for the load in flight, then saves", async () => {
    notReady();
    let release!: () => void;
    hooks.openGate = new Promise<void>((r) => (release = r));
    calls.getAll = 0;
    void store().init();
    const pending = store().recordSolve(9_000, "F B");
    release();
    await expect(pending).resolves.toBe("n2");
    expect(calls.getAll).toBe(1); // the one load, shared
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b", "n2"]);
    expect(store().saveError).toBeNull();
  });

  it("starts the load itself if nothing has yet", async () => {
    notReady();
    await expect(store().recordSolve(9_000, "F B")).resolves.toBe("n2");
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "n2"]);
  });

  it("says the storage won't open, and saves nothing, when the load failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    notReady();
    calls.failOpen = true;
    await expect(store().recordSolve(9_000, "F B")).resolves.toBeUndefined();
    expect(store().saveError).toMatchObject({ kind: "open", message: "UnknownError: backing store" });
    expect(rows).toHaveLength(2);
  });

  it("gives up after READY_WAIT_MS with a 'still loading' error, and the load still finishes", async () => {
    vi.useFakeTimers();
    try {
      notReady();
      let release!: () => void;
      hooks.openGate = new Promise<void>((r) => (release = r));
      const pending = store().recordSolve(9_000, "F B");
      await vi.advanceTimersByTimeAsync(READY_WAIT_MS - 1);
      expect(store().saveError).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(store().saveError).toMatchObject({ kind: "loading" });
      expect(rows).toHaveLength(2);
      release();
      await store().init();
      expect(store().loaded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refreshFromDb", () => {
  it("doesn't overwrite a solve recorded while it was reading", async () => {
    // The read has its snapshot of the rows (a, b) when the solve finishes and is saved.
    hooks.afterGetAll = async () => void (await store().recordSolve(9_000, "F B"));
    await store().refreshFromDb();
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b", "n2"]);
    expect(store().allSolves.map((s) => s.id)).toEqual(["a", "b", "n2"]);
    expect(store().solves.at(-1)?.timeMs).toBe(9_000);
  });

  it("still takes in changes made outside the store", async () => {
    rows.push(seed("synced", 10_000, 3));
    await store().refreshFromDb();
    expect(store().allSolves.map((s) => s.id)).toEqual(["a", "b", "synced"]);
  });
});

describe("lifetime achievements are 3x3 only", () => {
  const twoByTwo: Session = { ...s1, id: "s2", name: "2x2", event: "222" };

  it("a fast 2x2 time unlocks nothing", async () => {
    sessionRows.push(twoByTwo);
    await reinit();
    await store().switchSession("s2");
    await store().recordSolve(5_000, "R U"); // would be a Sub-10 on 3x3
    expect(store().achievementToast).toBeNull();
  });

  it("the same time in a 3x3 session does", async () => {
    sessionRows.push(twoByTwo);
    await reinit();
    await store().recordSolve(5_000, "R U");
    expect(store().achievementToast).toMatchObject({ id: "sub-10" });
  });

  it("2x2 solves already in the history don't count toward a 3x3 unlock", async () => {
    sessionRows.push(twoByTwo);
    rows.push(seed("fast2x2", 4_000, 3, { sessionId: "s2" }));
    await reinit();
    await store().recordSolve(9_000, "R U");
    expect(store().achievementToast).toMatchObject({ id: "sub-10" });
  });
});

describe("removeSolves", () => {
  it("deletes the batch in one database call and keeps one undo batch of the stored rows", async () => {
    await record(13_000, 14_000);
    calls.bulkDelete = 0;
    await store().removeSolves(["a", "n2", "n3"]);
    expect(calls.bulkDelete).toBe(1);
    expect(store().solves.map((s) => s.id)).toEqual(["b"]);
    expect(store().allSolves.map((s) => s.id)).toEqual(["b"]);
    expect(store().undoStack.map((b) => b.solves.map((s) => s.id))).toEqual([["a", "n2", "n3"]]);
    await store().undoRemove();
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b", "n2", "n3"]);
  });

  it("a failed delete reports it, re-reads the database and leaves no undo batch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    calls.failBulkDelete = true;
    calls.getAll = 0;
    await store().removeSolves(["a", "b"]);
    expect(store().saveError).toMatchObject({ kind: "write", message: "QuotaExceededError" });
    expect(calls.getAll).toBe(1);
    expect(store().solves.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store().undoStack).toEqual([]);
  });
});
