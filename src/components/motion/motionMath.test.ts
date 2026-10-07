import { describe, expect, it } from "vitest";
import { dragOffset, exitDelayMs, nextTabMotion, shouldDismissDrag, tabDirection } from "./motionMath";

describe("tabDirection", () => {
  it("slides forward to a later tab and back to an earlier one", () => {
    expect(tabDirection(0, 2)).toBe("fwd");
    expect(tabDirection(3, 1)).toBe("back");
  });
});

describe("nextTabMotion", () => {
  it("alternates the suffix so a repeat in the same direction restarts the animation", () => {
    const first = nextTabMotion(null, 0, 1);
    const second = nextTabMotion(first, 1, 2);
    const third = nextTabMotion(second, 2, 1);
    expect(first).toBe("fwd-a");
    expect(second).toBe("fwd-b");
    expect(third).toBe("back-a");
    expect(first).not.toBe(second);
  });
});

describe("exitDelayMs", () => {
  it("waits for the exit plus a frame, or not at all when motion is off", () => {
    expect(exitDelayMs(180, false)).toBe(200);
    expect(exitDelayMs(180, true)).toBe(0);
    expect(exitDelayMs(-5, false)).toBe(20);
  });
});

describe("drag to dismiss", () => {
  it("ignores upward pulls", () => {
    expect(dragOffset(-30)).toBe(0);
    expect(shouldDismissDrag({ dy: -200, dtMs: 100, heightPx: 600 })).toBe(false);
  });
  it("dismisses past a third of the height", () => {
    expect(shouldDismissDrag({ dy: 210, dtMs: 2000, heightPx: 600 })).toBe(true);
    expect(shouldDismissDrag({ dy: 150, dtMs: 2000, heightPx: 600 })).toBe(false);
  });
  it("dismisses a quick flick but not a slow short drag", () => {
    expect(shouldDismissDrag({ dy: 60, dtMs: 80, heightPx: 600 })).toBe(true);
    expect(shouldDismissDrag({ dy: 60, dtMs: 600, heightPx: 600 })).toBe(false);
    expect(shouldDismissDrag({ dy: 20, dtMs: 10, heightPx: 600 })).toBe(false);
  });
});
