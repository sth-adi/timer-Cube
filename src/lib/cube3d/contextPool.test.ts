import { describe, expect, it } from "vitest";
import { ContextPool, type PoolClient } from "./contextPool";

function client(visible = true) {
  const c = { shown: visible, evicted: 0, retried: 0, visible: () => c.shown, evict: () => void c.evicted++, retry: () => void c.retried++ };
  return c satisfies PoolClient & Record<string, unknown>;
}

describe("ContextPool", () => {
  it("grants up to max contexts", () => {
    const p = new ContextPool(3);
    const cs = [client(), client(), client(), client()];
    expect(cs.slice(0, 3).map((c) => p.acquire(c))).toEqual([true, true, true]);
    expect(p.acquire(cs[3])).toBe(false);
    expect(p.size).toBe(3);
  });
  it("evicts the oldest off-screen holder for a newcomer", () => {
    const p = new ContextPool(2);
    const [a, b, c] = [client(), client(), client()];
    p.acquire(a);
    p.acquire(b);
    a.shown = false;
    b.shown = false;
    expect(p.acquire(c)).toBe(true);
    expect(a.evicted).toBe(1);
    expect(b.evicted).toBe(0);
  });
  it("tells a visible waiter to retry when a slot frees, and skips hidden ones", () => {
    const p = new ContextPool(1);
    const [a, b, c] = [client(), client(), client()];
    p.acquire(a);
    expect(p.acquire(b)).toBe(false);
    expect(p.acquire(c)).toBe(false);
    b.shown = false;
    p.release(a);
    expect(b.retried).toBe(0);
    expect(c.retried).toBe(1);
    expect(p.acquire(c)).toBe(true);
  });
  it("releasing a client that never held one changes nothing", () => {
    const p = new ContextPool(1);
    const [a, b] = [client(), client()];
    p.acquire(a);
    p.acquire(b);
    p.release(b);
    expect(p.size).toBe(1);
  });
});
