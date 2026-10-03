import { describe, expect, it } from "vitest";
import { decideOwnership, resolveDataOwner } from "./cloudSync";

describe("resolveDataOwner", () => {
  it("uses the recorded owner when there is one", () => {
    expect(resolveDataOwner("alice", { bob: 50 }, "bob")).toBe("alice");
  });

  it("treats data nobody has synced as nobody's", () => {
    expect(resolveDataOwner(null, {}, "bob")).toBeNull();
    expect(resolveDataOwner(null, { alice: 0 }, "bob")).toBeNull();
  });

  it("counts data the signing-in account already pushed from here as its own (devices from before owners were recorded)", () => {
    expect(resolveDataOwner(null, { bob: 10, alice: 99 }, "bob")).toBe("bob");
  });

  it("otherwise attributes it to the account that pushed from here most recently", () => {
    expect(resolveDataOwner(null, { alice: 10, carol: 30 }, "bob")).toBe("carol");
  });
});

describe("decideOwnership", () => {
  const base = { userId: "bob", localSolves: 600, keptLocalFor: null };

  it("syncs the same account signing back in without asking", () => {
    expect(decideOwnership({ ...base, ownerId: "bob" })).toEqual({ kind: "sync" });
  });

  it("uploads data never owned by anyone on first sign-in", () => {
    expect(decideOwnership({ ...base, ownerId: null })).toEqual({ kind: "sync" });
  });

  it("asks before syncing another account's solves", () => {
    expect(decideOwnership({ ...base, ownerId: "alice" })).toEqual({ kind: "ask", ownerId: "alice" });
  });

  it("doesn't ask when the device has no solves to carry over", () => {
    expect(decideOwnership({ ...base, ownerId: "alice", localSolves: 0 })).toEqual({ kind: "sync" });
  });

  it("stays paused, without asking again, once the account chose to keep them on the device", () => {
    expect(decideOwnership({ ...base, ownerId: "alice", keptLocalFor: "alice" })).toEqual({ kind: "kept-local", ownerId: "alice" });
  });

  it("asks again when the solves now belong to a different account than the one that choice was made for", () => {
    expect(decideOwnership({ ...base, ownerId: "carol", keptLocalFor: "alice" })).toEqual({ kind: "ask", ownerId: "carol" });
  });
});
