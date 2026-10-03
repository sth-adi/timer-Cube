import { describe, expect, it } from "vitest";
import {
  EARLY_ATTEMPT_MIN_GAP_MS,
  RECONNECT_HIDDEN_LIMIT_MS,
  RECONNECT_STEADY_MS,
  RECONNECT_WINDOW_MS,
  hiddenTooLong,
  reconnectDelay,
  reconnectTimeline,
  tryEarly,
} from "./autoReconnect";

describe("reconnectDelay", () => {
  it("backs off 1s, 2s, 5s, 10s, then holds at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => reconnectDelay(n, 0))).toEqual([1_000, 2_000, 5_000, 10_000, 30_000, 30_000, 30_000]);
  });

  it("stops once the next attempt would start past the window", () => {
    expect(reconnectDelay(6, RECONNECT_WINDOW_MS - RECONNECT_STEADY_MS)).toBe(RECONNECT_STEADY_MS);
    expect(reconnectDelay(6, RECONNECT_WINDOW_MS - RECONNECT_STEADY_MS + 1)).toBeNull();
    expect(reconnectDelay(0, RECONNECT_WINDOW_MS)).toBeNull();
  });

  it("honours a custom window", () => {
    expect(reconnectDelay(0, 0, 500)).toBeNull();
    expect(reconnectDelay(0, 0, 1_000)).toBe(1_000);
  });

  it("refuses nonsense input rather than looping forever", () => {
    expect(reconnectDelay(-1, 0)).toBeNull();
    expect(reconnectDelay(0, Number.NaN)).toBeNull();
  });
});

describe("reconnectTimeline", () => {
  it("tries quickly at first, then every 30s for five minutes", () => {
    const at = reconnectTimeline();
    expect(at.slice(0, 5)).toEqual([1_000, 3_000, 8_000, 18_000, 48_000]);
    for (let i = 5; i < at.length; i++) expect(at[i] - at[i - 1]).toBe(RECONNECT_STEADY_MS);
    expect(at[at.length - 1]).toBeLessThanOrEqual(RECONNECT_WINDOW_MS);
    expect(at[at.length - 1] + RECONNECT_STEADY_MS).toBeGreaterThan(RECONNECT_WINDOW_MS);
    expect(at).toHaveLength(13);
  });

  it("is empty when the window is shorter than the first delay", () => {
    expect(reconnectTimeline(999)).toEqual([]);
  });
});

describe("hiddenTooLong", () => {
  it("only counts while the page is hidden", () => {
    expect(hiddenTooLong(null, 10 * RECONNECT_HIDDEN_LIMIT_MS)).toBe(false);
    expect(hiddenTooLong(1_000, 1_000 + RECONNECT_HIDDEN_LIMIT_MS - 1)).toBe(false);
    expect(hiddenTooLong(1_000, 1_000 + RECONNECT_HIDDEN_LIMIT_MS)).toBe(true);
  });
});

describe("tryEarly", () => {
  it("cuts the wait short when idle, but never mid-attempt or straight after one", () => {
    expect(tryEarly(false, null, 0)).toBe(true);
    expect(tryEarly(true, null, 0)).toBe(false);
    expect(tryEarly(false, 5_000, 5_000 + EARLY_ATTEMPT_MIN_GAP_MS - 1)).toBe(false);
    expect(tryEarly(false, 5_000, 5_000 + EARLY_ATTEMPT_MIN_GAP_MS)).toBe(true);
  });
});
