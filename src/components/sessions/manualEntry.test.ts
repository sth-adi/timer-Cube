import { describe, expect, it, vi } from "vitest";
import { RECENT_LIMIT, submitManualTime, withAdded, type AddedTime } from "./manualEntry";

describe("submitManualTime", () => {
  it("uses the id recordSolve returned for this save", async () => {
    const record = vi.fn().mockResolvedValue("solve-7");
    const r = await submitManualTime("12.34", "R U", record);
    expect(record).toHaveBeenCalledWith(12_340, "R U");
    expect(r).toEqual({ ok: true, entry: { id: "solve-7", ms: 12_340 } });
  });

  it("reports a failed save (undefined id) without an entry, so the text can be kept", async () => {
    const r = await submitManualTime("12.34", "R U", async () => undefined);
    expect(r).toEqual({ ok: false, error: null });
  });

  it("rejects text that isn't a time without saving anything", async () => {
    const record = vi.fn();
    const r = await submitManualTime("abc", "R U", record);
    expect(record).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });

  it("gives overlapping entries their own ids, whichever save finishes first", async () => {
    const resolvers: ((id: string | undefined) => void)[] = [];
    const record = () => new Promise<string | undefined>((res) => resolvers.push(res));
    const first = submitManualTime("1000", "A", record);
    const second = submitManualTime("2000", "B", record);
    resolvers[1]("id-b");
    resolvers[0]("id-a");
    expect(await first).toEqual({ ok: true, entry: { id: "id-a", ms: 10_000 } });
    expect(await second).toEqual({ ok: true, entry: { id: "id-b", ms: 20_000 } });
  });

  it("a failure of one overlapping entry doesn't affect the other", async () => {
    const results = ["ok-1", undefined];
    const record = async () => results.shift();
    const [a, b] = await Promise.all([submitManualTime("1000", "A", record), submitManualTime("2000", "B", record)]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, error: null });
  });
});

describe("withAdded", () => {
  it("appends and keeps only the newest RECENT_LIMIT chips", () => {
    let list: AddedTime[] = [];
    for (let i = 0; i < RECENT_LIMIT + 3; i++) list = withAdded(list, { id: `s${i}`, ms: i });
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0].id).toBe("s3");
    expect(list.at(-1)?.id).toBe(`s${RECENT_LIMIT + 2}`);
  });
});
