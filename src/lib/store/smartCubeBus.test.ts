import { afterEach, describe, expect, it, vi } from "vitest";
import { emitGyro, emitRawMove, subscribeGyro, subscribeRawMoves } from "./smartCubeBus";

const unsubs: (() => void)[] = [];
afterEach(() => {
  while (unsubs.length) unsubs.pop()!();
  vi.restoreAllMocks();
});

describe("smart-cube bus", () => {
  it("delivers to every listener even when one throws, and never rethrows", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = vi.fn();
    const after = vi.fn();
    unsubs.push(subscribeRawMoves(before));
    unsubs.push(
      subscribeRawMoves(() => {
        throw new Error("gesture handler bug");
      }),
    );
    unsubs.push(subscribeRawMoves(after));

    expect(() => emitRawMove({ token: "R", timeStampMs: 1 })).not.toThrow();
    expect(before).toHaveBeenCalledWith({ token: "R", timeStampMs: 1 });
    expect(after).toHaveBeenCalledWith({ token: "R", timeStampMs: 1 });
  });

  it("logs a failing listener once, not on every event", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    unsubs.push(
      subscribeRawMoves(() => {
        throw new Error("always");
      }),
    );
    for (let i = 0; i < 5; i++) emitRawMove({ token: "U", timeStampMs: i });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("keeps a throwing listener subscribed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    unsubs.push(
      subscribeRawMoves(() => {
        calls++;
        throw new Error("flaky");
      }),
    );
    emitRawMove({ token: "U", timeStampMs: 1 });
    emitRawMove({ token: "U", timeStampMs: 2 });
    expect(calls).toBe(2);
  });

  it("isolates gyro listeners the same way, and still records the latest sample", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen = vi.fn();
    unsubs.push(
      subscribeGyro(() => {
        throw new Error("twin bug");
      }),
    );
    unsubs.push(subscribeGyro(seen));
    const reading = { atMs: 5, q: { x: 0, y: 0, z: 0, w: 1 } };
    expect(() => emitGyro(reading)).not.toThrow();
    expect(seen).toHaveBeenCalledWith(reading);
  });
});
