import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { mergeStates } from "@/lib/db/merge";
import { BACKUP_APP, NUDGE_MIN_SOLVES, backupNudge, backupSummary, buildBackup, collectStorage, isBackupKey, parseBackup } from "./backup";

const solve = (id: string, over: Partial<Solve> = {}): Solve => ({ id, sessionId: "s1", timeMs: 12000, penalty: "none", scramble: "R U", date: 1000, updatedAt: 1000, ...over });
const session = { id: "s1", name: "Session 1", event: "333" as const, createdAt: 1, order: 0, updatedAt: 1 };

describe("isBackupKey", () => {
  it("takes this app's preferences and progress", () => {
    for (const k of ["cube-timer-settings", "cube-timer-algorithms", "cube-timer-my-algs", "cube.toolUsage.v1", "echo-best", "golf-best", "cube-room-name"]) expect(isBackupKey(k), k).toBe(true);
  });
  it("never takes credentials, transient guards, or its own bookkeeping", () => {
    for (const k of ["sb-abc-auth-token", "cube-timer-auth", "cube-timer:chunk-reload-at", "cube-timer-backup-meta", "random-other-app", "cube-timer-supabase-session"]) expect(isBackupKey(k), k).toBe(false);
  });
});

describe("collectStorage", () => {
  it("keeps only the backup keys", () => {
    const data: Record<string, string> = { "cube-timer-settings": "{}", "sb-x-auth-token": "secret", "echo-best": "7", unrelated: "1" };
    const keys = Object.keys(data);
    const fake = { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => data[k] ?? null };
    expect(collectStorage(fake)).toEqual({ "cube-timer-settings": "{}", "echo-best": "7" });
  });
});

describe("parseBackup", () => {
  const good = () => JSON.parse(JSON.stringify(buildBackup({ sessions: [session], solves: [solve("a")], deletions: [] }, { "cube-timer-settings": "{}" }, 5)));

  it("round-trips a backup", () => {
    const { file, skipped } = parseBackup(good());
    expect(skipped).toBe(0);
    expect(file.sync.solves).toHaveLength(1);
    expect(backupSummary(file)).toEqual({ solves: 1, sessions: 1, settings: 1 });
  });

  it("refuses things that aren't this app's backup, or are from the future", () => {
    expect(() => parseBackup(null)).toThrow(/isn't a backup/);
    expect(() => parseBackup({ app: "other" })).toThrow(/made by this app/);
    expect(() => parseBackup({ ...good(), version: 99 })).toThrow(/newer version/);
  });

  it("drops malformed rows and counts them instead of failing the whole file", () => {
    const b = good();
    b.sync.solves.push({ id: "bad" }, { ...solve("neg"), timeMs: "x" });
    b.sync.sessions.push(7);
    const { file, skipped } = parseBackup(b);
    expect(file.sync.solves.map((s) => s.id)).toEqual(["a"]);
    expect(skipped).toBe(3);
  });

  it("ignores storage keys it wouldn't have written (a doctored file can't plant credentials)", () => {
    const b = good();
    b.storage["sb-evil-auth-token"] = "x";
    b.storage["unrelated"] = "y";
    expect(Object.keys(parseBackup(b).file.storage)).toEqual(["cube-timer-settings"]);
  });

  it("an empty app is still a valid backup", () => {
    const { file } = parseBackup({ app: BACKUP_APP, version: 1, sync: {}, storage: {} });
    expect(file.sync).toEqual({ sessions: [], solves: [], deletions: [] });
  });
});

describe("restoring is a merge", () => {
  it("brings back solves a device lost, and never undoes newer work or deletions", () => {
    const backup = { sessions: [session], solves: [solve("a"), solve("b", { penalty: "plus2", updatedAt: 1000 }), solve("gone")], deletions: [] };
    // This device has moved on: b was since edited, "gone" was deleted, c is new, and a was lost with the browser data.
    const device = {
      sessions: [session],
      solves: [solve("b", { penalty: "dnf", updatedAt: 5000 }), solve("c")],
      deletions: [{ id: "gone", kind: "solve" as const, deletedAt: 3000 }],
    };
    const merged = mergeStates(device, backup);
    const ids = merged.solves.map((s) => s.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(merged.solves.find((s) => s.id === "b")?.penalty).toBe("dnf");
  });
});

describe("backupNudge", () => {
  it("stays quiet until there's something to lose", () => {
    expect(backupNudge({ lastAt: null, solvesAt: 0 }, NUDGE_MIN_SOLVES - 1, 1e12)).toBeNull();
    expect(backupNudge({ lastAt: null, solvesAt: 0 }, NUDGE_MIN_SOLVES, 1e12)).toBe("never");
  });
  it("only calls an old backup stale when a fair amount has happened since", () => {
    const day = 86_400_000;
    const meta = { lastAt: 0, solvesAt: 100 };
    expect(backupNudge(meta, 110, 40 * day)).toBeNull(); // old, but little new
    expect(backupNudge(meta, 130, 10 * day)).toBeNull(); // plenty new, but recent
    expect(backupNudge(meta, 130, 40 * day)).toBe("stale");
  });
});
