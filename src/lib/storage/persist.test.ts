import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPersistOutcome, requestPersistentStorage, resetPersistRequestForTests } from "./persist";

function stubStorage(persist: () => Promise<boolean>, persisted: () => Promise<boolean> = async () => false) {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.stubGlobal("navigator", { storage: { persist, persisted } });
}

describe("requestPersistentStorage", () => {
  beforeEach(() => resetPersistRequestForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("asks once and remembers the answer", async () => {
    const persist = vi.fn(async () => true);
    stubStorage(persist);
    expect(await requestPersistentStorage()).toBe("granted");
    expect(readPersistOutcome()).toBe("granted");
    resetPersistRequestForTests();
    expect(await requestPersistentStorage()).toBe("granted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("remembers a refusal instead of asking on every solve", async () => {
    const persist = vi.fn(async () => false);
    stubStorage(persist);
    expect(await requestPersistentStorage()).toBe("denied");
    resetPersistRequestForTests();
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("skips the request when storage is already persistent", async () => {
    const persist = vi.fn(async () => true);
    stubStorage(persist, async () => true);
    expect(await requestPersistentStorage()).toBe("granted");
    expect(persist).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, where the Storage API is missing or throws", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestPersistentStorage()).toBeNull();
    stubStorage(async () => {
      throw new Error("nope");
    });
    expect(await requestPersistentStorage()).toBeNull();
    expect(readPersistOutcome()).toBeNull();
  });
});
