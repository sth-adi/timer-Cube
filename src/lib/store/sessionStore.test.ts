import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Solve } from "@/types";

/** The store against an in-memory stand-in for Dexie: what it reads back is what counts. */
const rows: Solve[] = [];
const calls = { getAll: 0, getSession: 0, failAdd: false };
let clock = 1_000;

vi.mock("@/lib/db/db", () => ({ ensureDefaultSession: async () => ({ id: "s1", name: "Session 1", event: "333", createdAt: 0, order: 0, updatedAt: 0 }) }));
vi.mock("@/lib/db/sessions", () => ({
  listSessions: async () => [{ id: "s1", name: "Session 1", event: "333", createdAt: 0, order: 0, updatedAt: 0 }],
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
  deleteSolve: async (id: string) => void rows.splice(rows.findIndex((r) => r.id === id), 1),
  restoreSolves: async (list: Solve[]) => {
    const back = list.map((s) => ({ ...s, updatedAt: ++clock }));
    rows.push(...back);
    return back;
  },
  getAllSolves: async () => (calls.getAll++, [...rows].sort((a, b) => a.date - b.date)),
  getSessionSolves: async (id: string) => (calls.getSession++, rows.filter((r) => r.sessionId === id).sort((a, b) => a.date - b.date)),
  importSolves: vi.fn(),
}));
vi.mock("@/lib/store/scrambleStore", () => ({ useScrambleStore: { getState: () => ({ setEvent: async () => {} }) } }));
vi.mock("@/lib/storage/persist", () => ({ requestPersistentStorage: vi.fn(async () => null) }));

const { useSessionStore } = await import("./sessionStore");
const store = () => useSessionStore.getState();
const seed = (id: string, timeMs: number, date: number, extra: Partial<Solve> = {}): Solve => ({ id, sessionId: "s1", timeMs, penalty: "none", scramble: "R U", date, ...extra });

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => "1", setItem: () => {}, removeItem: () => {} });
  rows.length = 0;
  rows.push(seed("a", 12_000, 1), seed("b", 11_000, 2, { moveTimestamps: [0, 100] }));
  calls.getAll = 0;
  calls.getSession = 0;
  calls.failAdd = false;
  useSessionStore.setState({ saveError: null, lastPB: null, loaded: false });
  await store().init();
});

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
    await store().init();
    expect(calls.getAll).toBe(1);
    expect(store().allSolves.find((s) => s.id === "late")).toMatchObject({ timeMs: 10_000, moveTimestamps: [0, 2_000, 8_000] });
    expect(rows.find((r) => r.id === "late")?.timeMs).toBe(10_000);
    rows.push(seed("late2", 8_000, 4, { moveTimestamps: [-1, 5] }));
    await store().init();
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
});
