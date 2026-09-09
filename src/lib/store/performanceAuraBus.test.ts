import { describe, expect, it } from "vitest";
import { paceFromRatio, resetPerformanceAura, setPerformanceAura, subscribePerformanceAura } from "./performanceAuraBus";

describe("paceFromRatio", () => {
  it("is neutral right at the target", () => {
    expect(paceFromRatio(10000, 10000).status).toBe("neutral");
  });

  it("is neutral within a small band around the target", () => {
    expect(paceFromRatio(10300, 10000).status).toBe("neutral");
    expect(paceFromRatio(9700, 10000).status).toBe("neutral");
  });

  it("is ahead when running meaningfully faster than target", () => {
    const result = paceFromRatio(7000, 10000);
    expect(result.status).toBe("ahead");
    expect(result.intensity).toBeGreaterThan(0);
  });

  it("is behind when running meaningfully slower than target", () => {
    const result = paceFromRatio(13000, 10000);
    expect(result.status).toBe("behind");
    expect(result.intensity).toBeGreaterThan(0);
  });

  it("caps intensity at 1", () => {
    expect(paceFromRatio(100000, 10000).intensity).toBe(1);
  });

  it("treats a non-positive target as neutral rather than dividing by zero", () => {
    expect(paceFromRatio(5000, 0)).toEqual({ status: "neutral", intensity: 0 });
  });
});

describe("performance aura bus", () => {
  it("delivers the current value immediately on subscribe", () => {
    setPerformanceAura({ status: "ahead", intensity: 0.5 });
    const received: unknown[] = [];
    const unsub = subscribePerformanceAura((a) => received.push(a));
    expect(received).toEqual([{ status: "ahead", intensity: 0.5 }]);
    unsub();
  });

  it("notifies all subscribers on update", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const unsubA = subscribePerformanceAura((aura) => a.push(aura));
    const unsubB = subscribePerformanceAura((aura) => b.push(aura));
    setPerformanceAura({ status: "behind", intensity: 0.8 });
    expect(a[a.length - 1]).toEqual({ status: "behind", intensity: 0.8 });
    expect(b[b.length - 1]).toEqual({ status: "behind", intensity: 0.8 });
    unsubA();
    unsubB();
  });

  it("stops notifying after unsubscribe", () => {
    const received: unknown[] = [];
    const unsub = subscribePerformanceAura((aura) => received.push(aura));
    unsub();
    setPerformanceAura({ status: "ahead", intensity: 0.2 });
    expect(received).toHaveLength(1); // just the immediate delivery on subscribe
  });

  it("resetPerformanceAura clears to the null/0 default", () => {
    setPerformanceAura({ status: "behind", intensity: 1 });
    resetPerformanceAura();
    const received: unknown[] = [];
    const unsub = subscribePerformanceAura((aura) => received.push(aura));
    expect(received).toEqual([{ status: null, intensity: 0 }]);
    unsub();
  });
});
