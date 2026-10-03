import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTimerKey, type TimerKeyEvent } from "./useTimerInput";
import { TimerMachine } from "@/lib/timer/timerMachine";
import { isModalOpen, isTopModalLayer, onModalOpen, openModalLayer, resetModalLayersForTests } from "@/lib/store/modalBus";

afterEach(() => resetModalLayersForTests());

function key(code: string, type: "keydown" | "keyup" = "keydown", extra: Partial<TimerKeyEvent> = {}) {
  const preventDefault = vi.fn();
  const e: TimerKeyEvent = { type, code, repeat: false, timeStamp: 0, inField: false, preventDefault, ...extra };
  return { e, preventDefault };
}

function handlers() {
  return { press: vi.fn(), release: vi.fn(), reset: vi.fn() };
}

describe("handleTimerKey", () => {
  it("routes Space down/up to press/release and Escape to reset", () => {
    const h = handlers();
    handleTimerKey(key("Space", "keydown", { timeStamp: 5 }).e, h);
    handleTimerKey(key("Space", "keyup", { timeStamp: 9 }).e, h);
    handleTimerKey(key("Escape").e, h);
    expect(h.press).toHaveBeenCalledWith(5);
    expect(h.release).toHaveBeenCalledWith(9);
    expect(h.reset).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and leaves the default alone, while a modal is open", () => {
    const h = handlers();
    const layer = openModalLayer();
    for (const k of [key("Space"), key("Space", "keyup"), key("Escape")]) {
      handleTimerKey(k.e, h);
      // Space must still be free to activate a focused button in the dialog.
      expect(k.preventDefault).not.toHaveBeenCalled();
    }
    expect(h.press).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.reset).not.toHaveBeenCalled();
    layer.close();
    handleTimerKey(key("Space").e, h);
    expect(h.press).toHaveBeenCalledTimes(1);
  });

  it("swallows auto-repeated Space (no scroll, no button click) without pressing", () => {
    const h = handlers();
    const k = key("Space", "keydown", { repeat: true });
    handleTimerKey(k.e, h);
    expect(k.preventDefault).toHaveBeenCalled();
    expect(h.press).not.toHaveBeenCalled();
  });

  it("ignores keys typed into a text field", () => {
    const h = handlers();
    const k = key("Space", "keydown", { inField: true });
    handleTimerKey(k.e, h);
    expect(k.preventDefault).not.toHaveBeenCalled();
    expect(h.press).not.toHaveBeenCalled();
  });

  it("Escape mid-solve leaves the running solve alone (wired to the machine's escape)", () => {
    const m = new TimerMachine({ inspectionEnabled: false, holdToStartMs: 300, phaseCount: 1 });
    const h = { press: (at?: number) => m.press(at ?? 0), release: (at?: number) => m.release(at ?? 0), reset: () => void m.escape() };
    handleTimerKey(key("Space", "keydown", { timeStamp: 0 }).e, h);
    handleTimerKey(key("Space", "keyup", { timeStamp: 300 }).e, h);
    expect(m.phase).toBe("running");
    handleTimerKey(key("Escape").e, h);
    expect(m.phase).toBe("running");
    handleTimerKey(key("Space", "keydown", { timeStamp: 2300 }).e, h);
    expect(m.lastResult?.timeMs).toBe(2000);
  });
});

describe("modalBus", () => {
  it("stays open until every layer closes, and only the topmost is on top", () => {
    expect(isModalOpen()).toBe(false);
    const a = openModalLayer();
    const b = openModalLayer();
    expect(isTopModalLayer(b.token)).toBe(true);
    expect(isTopModalLayer(a.token)).toBe(false);
    b.close();
    b.close(); // idempotent
    expect(isModalOpen()).toBe(true);
    expect(isTopModalLayer(a.token)).toBe(true);
    a.close();
    expect(isModalOpen()).toBe(false);
  });

  it("tells subscribers when a modal opens", () => {
    const l = vi.fn();
    const off = onModalOpen(l);
    openModalLayer();
    expect(l).toHaveBeenCalledTimes(1);
    off();
    openModalLayer();
    expect(l).toHaveBeenCalledTimes(1);
  });
});
