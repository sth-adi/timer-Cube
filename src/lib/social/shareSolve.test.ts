import { describe, expect, it } from "vitest";
import { SupabaseTimeoutError } from "@/lib/supabase/withTimeout";
import { mapSharedSolveResponse, readGyroStream } from "./shareSolve";

const row = { scramble: "R U", reconstruction: "U' R'", time_ms: 1234, move_timestamps: [0, 100], puzzle: "333", event: null, username: "sam" };

describe("mapSharedSolveResponse", () => {
  it("maps a row to a solve", () => {
    expect(mapSharedSolveResponse({ data: row, error: null }, false)).toEqual({
      ok: true,
      solve: { scramble: "R U", reconstruction: "U' R'", timeMs: 1234, moveTimestamps: [0, 100], puzzle: "333", event: null, username: "sam", gyroStream: null },
    });
  });

  it("defaults missing optional columns", () => {
    const r = mapSharedSolveResponse({ data: { ...row, move_timestamps: null, event: undefined, username: undefined } }, false);
    expect(r).toMatchObject({ ok: true, solve: { moveTimestamps: null, event: null, username: null } });
  });

  it("a clean empty answer is the only not-found", () => {
    expect(mapSharedSolveResponse({ data: null, error: null }, false)).toEqual({ ok: false, reason: "not-found" });
  });

  it("a timeout is a timeout, not a bad link", () => {
    expect(mapSharedSolveResponse({ thrown: new SupabaseTimeoutError() }, false)).toEqual({ ok: false, reason: "timeout" });
  });

  it("a server or network error is an error", () => {
    expect(mapSharedSolveResponse({ data: null, error: { message: "boom" } }, false)).toEqual({ ok: false, reason: "error" });
    expect(mapSharedSolveResponse({ thrown: new Error("x") }, false)).toEqual({ ok: false, reason: "error" });
  });

  it("any failure while the browser is offline reads as offline", () => {
    expect(mapSharedSolveResponse({ data: null, error: { message: "Failed to fetch" } }, true)).toEqual({ ok: false, reason: "offline" });
    expect(mapSharedSolveResponse({ thrown: new SupabaseTimeoutError() }, true)).toEqual({ ok: false, reason: "offline" });
  });
});

describe("readGyroStream", () => {
  const ok = { atMs: [0, 50], qx: [0, 0], qy: [0, 0.1], qz: [0, 0], qw: [1, 0.99] };
  it("accepts a well-formed stream", () => {
    expect(readGyroStream(ok)).toEqual(ok);
    expect(mapSharedSolveResponse({ data: { ...row, gyro_stream: ok } }, false)).toMatchObject({ ok: true, solve: { gyroStream: ok } });
  });
  it("rejects anything else rather than drawing it", () => {
    expect(readGyroStream(null)).toBeNull();
    expect(readGyroStream("x")).toBeNull();
    expect(readGyroStream({ ...ok, qw: [1] })).toBeNull();
    expect(readGyroStream({ ...ok, qx: [0, "a"] })).toBeNull();
    expect(readGyroStream({ ...ok, atMs: [0], qx: [0], qy: [0], qz: [0], qw: [1] })).toBeNull();
    expect(readGyroStream({ ...ok, qy: [0, NaN] })).toBeNull();
  });
});
