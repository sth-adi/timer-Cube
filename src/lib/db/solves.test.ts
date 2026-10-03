import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deletion, FullSolve } from "@/types";
import { buildSessionExport, parseSessionExport } from "@/lib/utils/sessionExport";
import { buildCsTimerExport } from "@/lib/utils/csTimerExport";
import { parseCsTimerExport } from "@/lib/utils/csTimerImport";

/** An in-memory stand-in for the two Dexie tables importSolves touches. */
const store = vi.hoisted(() => ({ solves: new Map<string, FullSolve>(), deletions: new Map<string, Deletion>(), ids: 0, transactions: 0 }));

vi.mock("./db", () => ({
  newId: () => `new-${++store.ids}`,
  db: {
    transaction: async (_mode: string, ...rest: unknown[]) => {
      store.transactions++;
      return (rest[rest.length - 1] as () => Promise<unknown>)();
    },
    solves: {
      bulkGet: async (ids: string[]) => ids.map((id) => store.solves.get(id)),
      bulkPut: async (rows: FullSolve[]) => void rows.forEach((r) => store.solves.set(r.id, r)),
      bulkDelete: async (ids: string[]) => void ids.forEach((id) => store.solves.delete(id)),
      where: () => ({ equals: (sessionId: string) => ({ toArray: async () => [...store.solves.values()].filter((s) => s.sessionId === sessionId) }) }),
    },
    deletions: {
      bulkGet: async (ids: string[]) => ids.map((id) => store.deletions.get(id)),
      bulkDelete: async (ids: string[]) => void ids.forEach((id) => store.deletions.delete(id)),
      bulkPut: async (rows: Deletion[]) => void rows.forEach((r) => store.deletions.set(r.id, r)),
    },
  },
}));

import { bulkDeleteSolves, importSolves, importSolvesWithReport, planImport, solveFingerprint, type ImportRow } from "./solves";

const solve = (id: string, over: Partial<FullSolve> = {}): FullSolve => ({
  id,
  sessionId: "s1",
  timeMs: 10_000 + Number(id.replace(/\D/g, "") || 0),
  penalty: "none",
  scramble: `R U ${id}`,
  date: 1_700_000_000_000 + Number(id.replace(/\D/g, "") || 0) * 60_000,
  updatedAt: 1_700_000_000_000,
  ...over,
});

/** A row as it comes out of an import file: this app's own export, through JSON and back. */
const exported = (solves: FullSolve[]): ImportRow[] => parseSessionExport(JSON.parse(JSON.stringify(buildSessionExport("S", solves))));

const plan = (rows: ImportRow[], here: FullSolve[], opts: { sessionId?: string; deleted?: string[] } = {}) => {
  let n = 0;
  return planImport({
    sessionId: opts.sessionId ?? "s1",
    rows,
    existing: new Map(here.map((s) => [s.id, s])),
    deleted: new Set(opts.deleted ?? []),
    sessionSolves: here.filter((s) => s.sessionId === (opts.sessionId ?? "s1")),
    now: 2_000_000_000_000,
    makeId: () => `fresh-${++n}`,
  });
};

describe("planImport", () => {
  it("adds everything into an empty session, keeping the file's ids", () => {
    const p = plan(exported([solve("a1"), solve("a2")]), []);
    expect(p.result).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect(p.put.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(p.put.every((s) => s.sessionId === "s1" && s.updatedAt === 2_000_000_000_000)).toBe(true);
  });

  it("skips solves whose id is already here and not newer", () => {
    const here = [solve("a1"), solve("a2")];
    const p = plan(exported([...here, solve("a3")]), here);
    expect(p.result).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect(p.put.map((s) => s.id)).toEqual(["a3"]);
  });

  it("updates a solve when the file's version is newer, leaving it in its own session", () => {
    const here = [solve("a1", { sessionId: "other" })];
    const p = plan(exported([solve("a1", { penalty: "plus2", updatedAt: 1_800_000_000_000 })]), here);
    expect(p.result).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(p.put[0]).toMatchObject({ id: "a1", sessionId: "other", penalty: "plus2" });
    expect(p.put[0].updatedAt).toBe(2_000_000_000_000);
  });

  it("keeps the local copy when it is the newer one", () => {
    const here = [solve("a1", { comment: "edited later", updatedAt: 1_900_000_000_000 })];
    const p = plan(exported([solve("a1")]), here);
    expect(p.result).toEqual({ added: 0, updated: 0, skipped: 1 });
  });

  it("breaks a same-revision tie by content, like merge.ts — and an identical copy is just skipped", () => {
    const here = [solve("a1", { comment: "a" })];
    expect(plan(exported([solve("a1", { comment: "a" })]), here).result.skipped).toBe(1);
    // Two devices holding the two versions agree on the winner: exactly one direction replaces.
    const a = solve("a1", { comment: "a" });
    const b = solve("a1", { comment: "b" });
    const aOverB = plan(exported([a]), [b]).result.updated;
    const bOverA = plan(exported([b]), [a]).result.updated;
    expect(aOverB + bOverA).toBe(1);
  });

  it("matches id-less rows on date (to the second), time and scramble in the target session only", () => {
    const here = [solve("a1"), solve("a2", { sessionId: "other" })];
    const rows: ImportRow[] = [
      { timeMs: here[0].timeMs, penalty: "none", scramble: here[0].scramble, date: here[0].date + 400 },
      { timeMs: here[1].timeMs, penalty: "none", scramble: here[1].scramble, date: here[1].date },
      { timeMs: here[0].timeMs + 1, penalty: "none", scramble: here[0].scramble, date: here[0].date },
    ];
    const p = plan(rows, here);
    expect(p.result).toEqual({ added: 2, updated: 0, skipped: 1 });
    expect(p.put.map((s) => s.id)).toEqual(["fresh-1", "fresh-2"]);
  });

  it("recognises a solve imported earlier under a fresh id when the file now carries ids", () => {
    const here = [solve("fresh-old")];
    const p = plan(exported([solve("a1")]).map((r) => ({ ...r, timeMs: here[0].timeMs, scramble: here[0].scramble, date: here[0].date })), here);
    expect(p.result).toEqual({ added: 0, updated: 0, skipped: 1 });
  });

  it("skips duplicates within the file itself", () => {
    const rows = exported([solve("a1"), solve("a1"), solve("a2")]);
    const idless = rows.map((r) => ({ ...r, id: undefined }));
    expect(plan(rows, []).result).toEqual({ added: 2, updated: 0, skipped: 1 });
    expect(plan(idless, []).result).toEqual({ added: 2, updated: 0, skipped: 1 });
  });

  it("brings back a solve deleted here, dropping its deletion record", () => {
    const p = plan(exported([solve("a1")]), [], { deleted: ["a1"] });
    expect(p.result.added).toBe(1);
    expect(p.restoredIds).toEqual(["a1"]);
  });

  it("is idempotent: a second import of what the first wrote adds nothing", () => {
    const rows = exported(Array.from({ length: 20 }, (_, i) => solve(`a${i}`)));
    const first = plan(rows, []);
    expect(first.result.added).toBe(20);
    expect(plan(rows, first.put).result).toEqual({ added: 0, updated: 0, skipped: 20 });
  });

  it("dedupes a csTimer export of these very solves (whole-second dates, no ids)", () => {
    const here = Array.from({ length: 5 }, (_, i) => solve(`a${i}`, { date: 1_700_000_000_123 + i * 60_000 }));
    const cs = parseCsTimerExport(JSON.parse(JSON.stringify(buildCsTimerExport([{ name: "S", solves: [...here, solve("a9")] }]))));
    const p = plan(cs.solvesByKey.session1, here);
    expect(p.result).toEqual({ added: 1, updated: 0, skipped: 5 });
  });

  it("plans ~5k rows against ~5k existing quickly", () => {
    const here = Array.from({ length: 5000 }, (_, i) => solve(`a${i}`, { gyroStream: { atMs: [0, 50], qx: [0, 0], qy: [0, 0], qz: [0, 0], qw: [1, 1] } }));
    const rows = exported(here);
    const t = performance.now();
    const p = plan(rows, here);
    expect(p.result.skipped).toBe(5000);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it("fingerprints to the second, ignoring stray whitespace in the scramble", () => {
    expect(solveFingerprint({ date: 1999, timeMs: 10_000, scramble: " R U " })).toBe(solveFingerprint({ date: 1000, timeMs: 10_000, scramble: "R U" }));
  });
});

describe("importSolves", () => {
  beforeEach(() => {
    store.solves.clear();
    store.deletions.clear();
    store.ids = 0;
  });

  it("writes once, then reports everything as already here on the second import", async () => {
    const rows = exported([solve("a1"), solve("a2"), solve("a3")]);
    expect(await importSolvesWithReport("s1", rows)).toEqual({ added: 3, updated: 0, skipped: 0 });
    expect(await importSolvesWithReport("s1", rows)).toEqual({ added: 0, updated: 0, skipped: 3 });
    expect(store.solves.size).toBe(3);
  });

  it("dedupes an id-less (csTimer) file the second time round", async () => {
    const cs = parseCsTimerExport(JSON.parse(JSON.stringify(buildCsTimerExport([{ name: "S", solves: [solve("a1"), solve("a2")] }]))));
    expect(await importSolves("s1", cs.solvesByKey.session1)).toBe(2);
    expect(await importSolves("s1", cs.solvesByKey.session1)).toBe(0);
    expect(store.solves.size).toBe(2);
  });

  it("restores a deleted solve and clears its deletion record", async () => {
    store.deletions.set("a1", { id: "a1", kind: "solve", deletedAt: 1_900_000_000_000 });
    expect(await importSolvesWithReport("s1", exported([solve("a1")]))).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(store.deletions.has("a1")).toBe(false);
    expect(store.solves.get("a1")?.sessionId).toBe("s1");
  });
});

describe("bulkDeleteSolves", () => {
  beforeEach(() => {
    store.solves.clear();
    store.deletions.clear();
    store.transactions = 0;
  });

  it("removes the rows and records a deletion for each, in one transaction", async () => {
    const [a, b, c] = [solve("a1"), solve("a2"), solve("a3")];
    for (const s of [a, b, c]) store.solves.set(s.id, s);
    const removed = await bulkDeleteSolves(["a1", "a3"]);
    expect(removed).toEqual([a, c]);
    expect([...store.solves.keys()]).toEqual(["a2"]);
    expect([...store.deletions.values()].map((d) => [d.id, d.kind])).toEqual([["a1", "solve"], ["a3", "solve"]]);
    const stamps = new Set([...store.deletions.values()].map((d) => d.deletedAt));
    expect(stamps.size).toBe(1);
    expect(store.transactions).toBe(1);
  });

  it("records a deletion even for an id with no row here, as deleteSolve does, and returns only real rows", async () => {
    const a = solve("a1");
    store.solves.set(a.id, a);
    const removed = await bulkDeleteSolves(["ghost", "a1", "a1"]);
    expect(removed).toEqual([a]);
    expect([...store.deletions.keys()].sort()).toEqual(["a1", "ghost"]);
  });

  it("does nothing, not even a transaction, for no ids", async () => {
    expect(await bulkDeleteSolves([])).toEqual([]);
    expect(store.transactions).toBe(0);
  });

  it("leaves rows that restoreSolves can bring back", async () => {
    const a = solve("a1");
    store.solves.set(a.id, a);
    const [removed] = await bulkDeleteSolves(["a1"]);
    expect(removed).toEqual(a);
    expect(store.deletions.has("a1")).toBe(true);
  });
});
