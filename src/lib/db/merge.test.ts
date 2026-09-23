import { describe, expect, it } from "vitest";
import type { Penalty, Session, Solve } from "@/types";
import { contentKey, mergeStates, planMerge, type SyncState } from "./merge";

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
    const s: Solve = { id, sessionId, timeMs: 10_000, penalty: "none", scramble: "R U", date: t, updatedAt: t };
    this.state = { ...this.state, solves: [...this.state.solves, s] };
  }
  edit(id: string, t: number, changes: Partial<Solve>) {
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
