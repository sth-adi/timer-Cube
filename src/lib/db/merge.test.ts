import { describe, expect, it } from "vitest";
import type { Penalty, Session, FullSolve } from "@/types";
import {
  cascadeSolve,
  contentKey,
  mergeStates,
  planMerge,
  recoveredSessionId,
  RECOVERED_SESSION_NAME,
  solvesAMergeCanTouch,
  type SyncState,
} from "./merge";

/**
 * Devices (and the cloud) as in-memory SyncStates. "Syncing" two parties
 * exchanges snapshots and both apply the same merge — exactly what
 * device-to-device sync does, and what cloud sync does in two steps
 * (pull: merge the cloud into the device; push: merge the device into the cloud).
 */
class Device {
  state: SyncState = { sessions: [], solves: [], deletions: [] };
  constructor(public name: string) {}

  addSession(id: string, t: number) {
    const s: Session = { id, name: id, event: "333", createdAt: t, order: 0, updatedAt: t };
    this.state = { ...this.state, sessions: [...this.state.sessions, s] };
  }
  addSolve(id: string, t: number, sessionId = "S") {
    const s: FullSolve = { id, sessionId, timeMs: 10_000, penalty: "none", scramble: "R U", date: t, updatedAt: t };
    this.state = { ...this.state, solves: [...this.state.solves, s] };
  }
  edit(id: string, t: number, changes: Partial<FullSolve>) {
    this.state = { ...this.state, solves: this.state.solves.map((s) => (s.id === id ? { ...s, ...changes, updatedAt: t } : s)) };
  }
  setPenalty(id: string, penalty: Penalty, t: number) {
    this.edit(id, t, { penalty });
  }
  deleteSolve(id: string, t: number) {
    this.state = {
      ...this.state,
      solves: this.state.solves.filter((s) => s.id !== id),
      deletions: [...this.state.deletions.filter((d) => d.id !== id), { id, kind: "solve", deletedAt: t }],
    };
  }
  deleteSession(id: string, t: number) {
    const gone = this.state.solves.filter((s) => s.sessionId === id);
    this.state = {
      sessions: this.state.sessions.filter((s) => s.id !== id),
      solves: this.state.solves.filter((s) => s.sessionId !== id),
      deletions: [...this.state.deletions, { id, kind: "session", deletedAt: t }, ...gone.map((s) => ({ id: s.id, kind: "solve" as const, deletedAt: t }))],
    };
  }
  solve(id: string) {
    return this.state.solves.find((s) => s.id === id);
  }
}

/** Device-to-device: both send their snapshot, both merge the other's. */
function p2p(a: Device, b: Device) {
  const [sa, sb] = [a.state, b.state];
  a.state = mergeStates(sa, sb);
  b.state = mergeStates(sb, sa);
}

/** Cloud sync as cloudSync.ts does it: pull and merge, then push the merged result. */
function cloudSync(device: Device, cloud: Device) {
  device.state = mergeStates(device.state, cloud.state);
  cloud.state = mergeStates(cloud.state, device.state);
}

const canon = (s: SyncState) =>
  contentKey({
    sessions: [...s.sessions].sort((x, y) => x.id.localeCompare(y.id)),
    solves: [...s.solves].sort((x, y) => x.id.localeCompare(y.id)),
    deletions: [...s.deletions].sort((x, y) => x.id.localeCompare(y.id)),
  });

describe("edits", () => {
  it("a penalty changed on one device reaches the other, in either sync direction", () => {
    for (const order of ["ab", "ba"]) {
      const a = new Device("A");
      const b = new Device("B");
      a.addSolve("x", 100);
      p2p(a, b);
      a.setPenalty("x", "plus2", 200);
      if (order === "ab") p2p(a, b);
      else p2p(b, a);
      expect(a.solve("x")!.penalty).toBe("plus2");
      expect(b.solve("x")!.penalty).toBe("plus2");
    }
  });

  it("the most recent edit wins when both devices changed the same solve", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    p2p(a, b);
    a.edit("x", 200, { comment: "from A" });
    b.edit("x", 300, { comment: "from B", penalty: "dnf" });
    p2p(a, b);
    expect(a.solve("x")).toMatchObject({ comment: "from B", penalty: "dnf" });
    expect(canon(a.state)).toBe(canon(b.state));
  });

  it("edits made at the same instant still converge to one version everywhere", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    p2p(a, b);
    a.edit("x", 200, { comment: "A" });
    b.edit("x", 200, { comment: "B" });
    p2p(a, b);
    expect(canon(a.state)).toBe(canon(b.state));
  });

  it("legacy rows without updatedAt fall back to their date", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    a.state.solves[0] = { ...a.state.solves[0], updatedAt: undefined };
    b.state = { ...a.state, solves: [{ ...a.state.solves[0], penalty: "plus2", updatedAt: 150 }] };
    p2p(a, b);
    expect(a.solve("x")!.penalty).toBe("plus2");
  });
});

describe("deletions", () => {
  it("a deletion propagates, and the other device can't bring the solve back", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    p2p(a, b);
    a.deleteSolve("x", 200);
    p2p(b, a); // B still has x and offers it back
    expect(a.solve("x")).toBeUndefined();
    expect(b.solve("x")).toBeUndefined();
    p2p(a, b); // and again, for good measure
    expect(a.solve("x")).toBeUndefined();
  });

  it("the review's case: an older second device can no longer re-upload a deleted solve to the cloud", () => {
    const cloud = new Device("cloud");
    const phone = new Device("phone");
    const laptop = new Device("laptop");
    phone.addSolve("x", 100);
    cloudSync(phone, cloud);
    cloudSync(laptop, cloud); // laptop now has x
    phone.deleteSolve("x", 200);
    cloudSync(phone, cloud); // the cloud learns about the deletion
    cloudSync(laptop, cloud); // laptop was offline with its old copy — pulls first, so the deletion wins
    expect(cloud.solve("x")).toBeUndefined();
    expect(laptop.solve("x")).toBeUndefined();
    cloudSync(phone, cloud);
    expect(phone.solve("x")).toBeUndefined();
  });

  it("an edit made after a deletion elsewhere wins — the most recent change counts", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    p2p(a, b);
    a.deleteSolve("x", 200);
    b.setPenalty("x", "plus2", 300);
    p2p(a, b);
    expect(a.solve("x")!.penalty).toBe("plus2");
    expect(canon(a.state)).toBe(canon(b.state));
  });

  it("a deletion at the same instant as an edit wins", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("x", 100);
    p2p(a, b);
    a.deleteSolve("x", 200);
    b.setPenalty("x", "plus2", 200);
    p2p(a, b);
    expect(a.solve("x")).toBeUndefined();
    expect(b.solve("x")).toBeUndefined();
  });

  it("deleting a session removes its solves everywhere, including ones the deleting device never saw", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSession("S", 50);
    a.addSolve("x", 100);
    p2p(a, b);
    b.addSolve("y", 150); // added on B, A doesn't know it yet
    a.deleteSession("S", 200);
    p2p(a, b);
    for (const d of [a, b]) {
      expect(d.state.sessions).toHaveLength(0);
      expect(d.state.solves).toHaveLength(0);
    }
    expect(canon(a.state)).toBe(canon(b.state));
  });
});

describe("planMerge", () => {
  it("lists exactly what the local side must change", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSolve("keep", 100);
    a.addSolve("edited", 100);
    a.addSolve("gone", 100);
    p2p(a, b);
    b.setPenalty("edited", "plus2", 200);
    b.deleteSolve("gone", 200);
    b.addSolve("new", 250);
    const plan = planMerge(a.state, b.state);
    expect(plan.putSolves.map((s) => s.id).sort()).toEqual(["edited", "new"]);
    expect(plan.deleteSolveIds).toEqual(["gone"]);
    expect(plan.putDeletions.map((d) => d.id)).toEqual(["gone"]);
    expect(plan.added.solves).toBe(1);
    expect(plan.updated).toBe(1);
    expect(plan.removed).toBe(1);
    // Nothing to do once in step.
    const after = mergeStates(a.state, b.state);
    const noop = planMerge(after, b.state);
    expect(noop.putSolves.length + noop.deleteSolveIds.length + noop.putDeletions.length).toBe(0);
  });
});

describe("convergence", () => {
  it("any order of syncs between three devices and the cloud ends identical", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 40; trial++) {
      const devices = [new Device("A"), new Device("B"), new Device("C")];
      const cloud = new Device("cloud");
      let t = 1;
      for (let step = 0; step < 60; step++) {
        const d = devices[Math.floor(rand() * 3)];
        const r = rand();
        const ids = d.state.solves.map((s) => s.id);
        if (r < 0.3 || ids.length === 0) d.addSolve(`s${trial}-${step}`, t);
        else if (r < 0.55) d.setPenalty(ids[Math.floor(rand() * ids.length)], rand() < 0.5 ? "plus2" : "dnf", t);
        else if (r < 0.7) d.deleteSolve(ids[Math.floor(rand() * ids.length)], t);
        else if (r < 0.85) cloudSync(d, cloud);
        else p2p(d, devices[Math.floor(rand() * 3)]);
        // Clocks aren't perfectly in step across devices; sometimes two events share a timestamp.
        t += rand() < 0.2 ? 0 : 1;
      }
      // Everyone syncs with the cloud twice over.
      for (let round = 0; round < 2; round++) for (const d of devices) cloudSync(d, cloud);
      const final = canon(cloud.state);
      for (const d of devices) expect(canon(d.state)).toBe(final);
    }
  });
});

describe("withLocalOnlyFields", () => {
  const base = { sessionId: "s", timeMs: 1000, penalty: "none" as Penalty, scramble: "R", date: 1 };
  it("puts the cube and repair back on a row that came from the cloud without them", async () => {
    const { withLocalOnlyFields } = await import("./merge");
    const local: FullSolve = { id: "a", ...base, updatedAt: 5, cube: { id: "mac:AA", name: "GAN" }, repaired: { kind: "inserted", index: 3, tokens: ["U"] } };
    const remote: FullSolve = { id: "a", ...base, updatedAt: 5 };
    const [merged] = withLocalOnlyFields([remote], [local]);
    expect(merged.cube).toEqual(local.cube);
    expect(merged.repaired).toEqual(local.repaired);
    // …so the tie with the local row is no longer a content coin-flip.
    expect(contentKey(merged)).toBe(contentKey(local));
  });
  it("leaves other rows, and rows with nothing to carry, alone", async () => {
    const { withLocalOnlyFields } = await import("./merge");
    const remote: FullSolve = { id: "b", ...base };
    expect(withLocalOnlyFields([remote], [])).toEqual([remote]);
    expect(withLocalOnlyFields([remote], [{ id: "b", ...base }])[0]).toBe(remote);
  });
});

describe("undoing a deletion", () => {
  it("a restored solve (newer than its deletion record, which is gone) beats the deletion still held by another device", () => {
    const row: FullSolve = { id: "x", sessionId: "s", timeMs: 9000, penalty: "none", scramble: "R", date: 1, updatedAt: 100 };
    const restored: FullSolve = { ...row, updatedAt: 5000 };
    const other = { sessions: [], solves: [], deletions: [{ id: "x", kind: "solve" as const, deletedAt: 3000 }] };
    const here = { sessions: [], solves: [restored], deletions: [] };
    const merged = mergeStates(here, other);
    expect(merged.solves.map((s) => s.id)).toEqual(["x"]);
    expect(merged.deletions.some((d) => d.id === "x")).toBe(false);
  });
  it("…while a restore that didn't bump updatedAt would have lost, which is why restoreSolves does", () => {
    const stale: FullSolve = { id: "x", sessionId: "s", timeMs: 9000, penalty: "none", scramble: "R", date: 1, updatedAt: 100 };
    const other = { sessions: [], solves: [], deletions: [{ id: "x", kind: "solve" as const, deletedAt: 3000 }] };
    expect(mergeStates({ sessions: [], solves: [stale], deletions: [] }, other).solves).toEqual([]);
  });
});

describe("a session deleted elsewhere vs solves recorded after the deletion", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("recoveredSessionId is a stable, distinct, uuid-shaped function of the deleted id", () => {
    expect(recoveredSessionId("S")).toBe(recoveredSessionId("S"));
    expect(recoveredSessionId("S")).toMatch(UUID);
    expect(recoveredSessionId("S")).not.toBe(recoveredSessionId("T"));
    expect(recoveredSessionId("S")).not.toBe("S");
    const real = crypto.randomUUID();
    expect(recoveredSessionId(real)).toMatch(UUID);
    expect(recoveredSessionId(real)).not.toBe(real);
    // Pinned: ids already pushed to the cloud must keep coming out the same.
    expect(recoveredSessionId("00000000-0000-4000-8000-000000000000")).toBe("5cae5bdb-6cd6-4fe3-be49-b275972058d1");
  });

  it("older solves are deleted with their session, newer ones are kept and re-homed into Recovered", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.addSession("S", 50);
    a.addSolve("old", 100);
    p2p(a, b);
    b.addSolve("trip", 300); // offline on B, after the deletion below
    a.deleteSession("S", 200);
    p2p(a, b);
    const rid = recoveredSessionId("S");
    for (const d of [a, b]) {
      expect(d.state.sessions.map((s) => s.id)).toEqual([rid]);
      expect(d.state.sessions[0].name).toBe(`${RECOVERED_SESSION_NAME} (S)`);
      expect(d.solve("old")).toBeUndefined();
      expect(d.solve("trip")).toMatchObject({ sessionId: rid, updatedAt: 301, date: 300, timeMs: 10_000 });
      expect(d.state.deletions.some((x) => x.id === "trip")).toBe(false);
      expect(d.state.deletions.some((x) => x.id === "S" && x.kind === "session")).toBe(true);
    }
    expect(canon(a.state)).toBe(canon(b.state));
  });

  it("the Recovered session takes the deleted one's event and order when they are known", () => {
    const b = new Device("B");
    b.state = { sessions: [{ id: "S", name: "OH", event: "444", createdAt: 1, order: 7, updatedAt: 1 }], solves: [], deletions: [] };
    b.addSolve("trip", 300, "S");
    const merged = mergeStates(b.state, { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 200 }] });
    expect(merged.sessions).toEqual([
      { id: recoveredSessionId("S"), name: "Recovered (OH)", event: "444", createdAt: 200, order: 7, updatedAt: 200 },
    ]);
  });

  it("a solve at the very instant of the deletion goes with its session; one a millisecond later survives", () => {
    const b = new Device("B");
    b.addSession("S", 50);
    b.addSolve("tie", 200);
    b.addSolve("after", 201);
    const merged = mergeStates(b.state, { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 200 }] });
    expect(merged.solves.map((x) => x.id)).toEqual(["after"]);
    expect(merged.deletions.find((x) => x.id === "tie")).toEqual({ id: "tie", kind: "solve", deletedAt: 200 });
  });

  it("an edit made after the deletion also keeps an old solve (newest change wins)", () => {
    const b = new Device("B");
    b.addSession("S", 50);
    b.addSolve("x", 100);
    b.setPenalty("x", "plus2", 500);
    const merged = mergeStates(b.state, { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 200 }] });
    expect(merged.solves).toHaveLength(1);
    expect(merged.solves[0]).toMatchObject({ id: "x", penalty: "plus2", sessionId: recoveredSessionId("S"), updatedAt: 501 });
  });

  it("legacy solves without updatedAt are judged by their date", () => {
    const row: FullSolve = { id: "x", sessionId: "S", timeMs: 1, penalty: "none", scramble: "R", date: 250 };
    const gone = new Map([["S", { id: "S", kind: "session" as const, deletedAt: 200 }]]);
    expect(cascadeSolve(row, gone)).toMatchObject({ kind: "rehome", solve: { sessionId: recoveredSessionId("S"), updatedAt: 251 }, via: ["S"] });
    expect(cascadeSolve({ ...row, date: 150 }, gone)).toEqual({ kind: "drop", deletedAt: 200 });
    expect(cascadeSolve({ ...row, sessionId: "other" }, gone)).toEqual({ kind: "keep", solve: { ...row, sessionId: "other" } });
  });

  it("two devices re-homing the same solves, and several survivors of one session, make exactly one Recovered session", () => {
    const cloud = new Device("cloud");
    const a = new Device("A");
    const b = new Device("B");
    const c = new Device("C");
    a.addSession("S", 50);
    cloudSync(a, cloud);
    cloudSync(b, cloud);
    cloudSync(c, cloud);
    b.addSolve("t1", 300);
    b.addSolve("t2", 310);
    c.addSolve("t3", 320);
    a.deleteSession("S", 200);
    cloudSync(a, cloud);
    cloudSync(b, cloud);
    cloudSync(c, cloud);
    cloudSync(a, cloud);
    cloudSync(b, cloud);
    cloudSync(c, cloud);
    for (const d of [a, b, c, cloud]) {
      expect(d.state.sessions.filter((s) => s.name.startsWith(RECOVERED_SESSION_NAME))).toHaveLength(1);
      expect(d.state.solves.map((x) => x.id).sort()).toEqual(["t1", "t2", "t3"]);
      expect(new Set(d.state.solves.map((x) => x.sessionId))).toEqual(new Set([recoveredSessionId("S")]));
    }
    expect(canon(a.state)).toBe(canon(b.state));
    expect(canon(a.state)).toBe(canon(c.state));
    expect(canon(a.state)).toBe(canon(cloud.state));
  });

  it("is idempotent: merging again changes nothing, and a stale copy of the old solve can't pull it back", () => {
    const b = new Device("B");
    b.addSession("S", 50);
    b.addSolve("trip", 300);
    const stale = { sessions: b.state.sessions, solves: b.state.solves, deletions: [] };
    const deletion: SyncState = { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 200 }] };
    const once = mergeStates(b.state, deletion);
    const twice = mergeStates(once, deletion);
    expect(canon(twice)).toBe(canon(once));
    const again = mergeStates(once, stale);
    expect(canon(again)).toBe(canon(once));
    const plan = planMerge(once, deletion);
    expect(plan.putSolves.length + plan.putSessions.length + plan.deleteSolveIds.length + plan.deleteSessionIds.length + plan.putDeletions.length).toBe(0);
  });

  it("a user's edits to the Recovered session (rename) are kept over the one the merge would make", () => {
    const b = new Device("B");
    const rid = recoveredSessionId("S");
    b.state = {
      sessions: [{ id: rid, name: "Trip", event: "333", createdAt: 200, order: 3, updatedAt: 900 }],
      solves: [{ id: "trip", sessionId: "S", timeMs: 1, penalty: "none", scramble: "R", date: 300, updatedAt: 300 }],
      deletions: [],
    };
    const merged = mergeStates(b.state, { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 200 }] });
    expect(merged.sessions.map((s) => s.name)).toEqual(["Trip"]);
    expect(merged.solves[0].sessionId).toBe(rid);
  });

  it("if the Recovered session itself was deleted since, the solve is judged against that deletion", () => {
    const rid = recoveredSessionId("S");
    const solves: FullSolve[] = [
      { id: "old", sessionId: "S", timeMs: 1, penalty: "none", scramble: "R", date: 300, updatedAt: 300 },
      { id: "new", sessionId: "S", timeMs: 1, penalty: "none", scramble: "R", date: 700, updatedAt: 700 },
    ];
    const remote: SyncState = {
      sessions: [],
      solves: [],
      deletions: [
        { id: "S", kind: "session", deletedAt: 200 },
        { id: rid, kind: "session", deletedAt: 500 },
      ],
    };
    const merged = mergeStates({ sessions: [], solves, deletions: [] }, remote);
    // "old" is newer than S's deletion but not than Recovered's (301 <= 500): gone. "new" survives under Recovered-of-Recovered.
    expect(merged.solves.map((x) => x.id)).toEqual(["new"]);
    expect(merged.solves[0].sessionId).toBe(recoveredSessionId(rid));
    expect(merged.sessions.map((x) => x.id)).toEqual([recoveredSessionId(rid)]);
    expect(merged.deletions.find((x) => x.id === "old")).toEqual({ id: "old", kind: "solve", deletedAt: 500 });
  });

  it("a deletion still wins for old data, everywhere: the existing cascade is unchanged for solves older than it", () => {
    const merged = mergeStates(local0(), { sessions: [], solves: [], deletions: [{ id: "S", kind: "session", deletedAt: 50 }] });
    expect(merged.sessions).toEqual([]);
    expect(merged.solves).toEqual([]);
  });

  it("converges under random syncs with session deletions and offline solves", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 40; trial++) {
      const devices = [new Device("A"), new Device("B"), new Device("C")];
      const cloud = new Device("cloud");
      devices[0].addSession("S1", 1);
      devices[0].addSession("S2", 1);
      let t = 10;
      for (let step = 0; step < 60; step++) {
        const d = devices[Math.floor(rand() * 3)];
        const r = rand();
        const ids = d.state.solves.map((x) => x.id);
        const sessions = d.state.sessions.map((x) => x.id);
        if (r < 0.3 || ids.length === 0) d.addSolve(`s${trial}-${step}`, t, sessions.length ? sessions[Math.floor(rand() * sessions.length)] : "S1");
        else if (r < 0.4) d.setPenalty(ids[Math.floor(rand() * ids.length)], "dnf", t);
        else if (r < 0.5 && sessions.length) d.deleteSession(sessions[Math.floor(rand() * sessions.length)], t);
        else if (r < 0.75) cloudSync(d, cloud);
        else p2p(d, devices[Math.floor(rand() * 3)]);
        t += rand() < 0.2 ? 0 : 1;
      }
      for (let round = 0; round < 3; round++) for (const d of devices) cloudSync(d, cloud);
      const final = canon(cloud.state);
      for (const d of devices) expect(canon(d.state)).toBe(final);
    }
  });
});

function local0(): SyncState {
  return {
    sessions: [{ id: "S", name: "S", event: "333", createdAt: 1, order: 0, updatedAt: 1 }],
    solves: [10, 20, 30].map((t) => ({ id: `x${t}`, sessionId: "S", timeMs: 1, penalty: "none" as Penalty, scramble: "R", date: t, updatedAt: t })),
    deletions: [],
  };
}

describe("solvesAMergeCanTouch", () => {
  it("lists remote solve ids, every deletion id by kind, and nothing else", () => {
    const touch = solvesAMergeCanTouch(
      { deletions: [{ id: "ls", kind: "solve", deletedAt: 1 }, { id: "lS", kind: "session", deletedAt: 1 }] },
      { solves: [{ id: "r", sessionId: "S", timeMs: 1, penalty: "none", scramble: "R", date: 1 }], deletions: [{ id: "rd", kind: "solve", deletedAt: 1 }, { id: "rS", kind: "session", deletedAt: 1 }] },
    );
    expect(touch.solveIds.sort()).toEqual(["ls", "r", "rd"]);
    expect(touch.sessionIds.sort()).toEqual(["lS", "rS"]);
  });

  it("planMerge over only those solves is exactly planMerge over all of them (random states)", () => {
    let seed = 99;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pickOf = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    const sessionIds = ["S1", "S2", "S3", recoveredSessionId("S1")];
    const mkSolve = (id: string): FullSolve => {
      const t = Math.floor(rand() * 20);
      return { id, sessionId: pickOf(sessionIds), timeMs: 1000 + Math.floor(rand() * 5) * 1000, penalty: "none", scramble: "R", date: t, ...(rand() < 0.8 ? { updatedAt: t + Math.floor(rand() * 5) } : {}) };
    };
    const ids = Array.from({ length: 24 }, (_, i) => `x${i}`);
    for (let trial = 0; trial < 300; trial++) {
      const side = () => ({
        sessions: sessionIds.filter(() => rand() < 0.5).map((id) => ({ id, name: id, event: "333" as const, createdAt: 1, order: 0, updatedAt: Math.floor(rand() * 20) })),
        solves: ids.filter(() => rand() < 0.35).map(mkSolve),
        deletions: [
          ...ids.filter(() => rand() < 0.1).map((id) => ({ id, kind: "solve" as const, deletedAt: Math.floor(rand() * 25) })),
          ...sessionIds.filter(() => rand() < 0.25).map((id) => ({ id, kind: "session" as const, deletedAt: Math.floor(rand() * 25) })),
        ],
      });
      const mine = side();
      const remote = side();
      const touch = solvesAMergeCanTouch(mine, remote);
      const ids2 = new Set(touch.solveIds);
      const sessions2 = new Set(touch.sessionIds);
      const subset = { ...mine, solves: mine.solves.filter((s) => ids2.has(s.id) || sessions2.has(s.sessionId)) };
      expect(planMerge(subset, remote)).toEqual(planMerge(mine, remote));
    }
  });
});
