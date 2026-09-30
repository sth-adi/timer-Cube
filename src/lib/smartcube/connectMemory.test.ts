import { describe, expect, it } from "vitest";
import { normalizeMac, readLastCube, writeLastCube } from "./connectMemory";

describe("normalizeMac", () => {
  it("accepts every common way of writing it", () => {
    expect(normalizeMac("aa:bb:cc:dd:ee:ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("AA-BB-CC-DD-EE-FF")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("aabbccddeeff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("  aa bb cc dd ee ff ")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("AA.BB.CC.DD.EE.FF")).toBe("AA:BB:CC:DD:EE:FF");
  });
  it("rejects anything that isn't six bytes of hex", () => {
    expect(normalizeMac("")).toBeNull();
    expect(normalizeMac("AA:BB:CC:DD:EE")).toBeNull();
    expect(normalizeMac("AA:BB:CC:DD:EE:FF:00")).toBeNull();
    expect(normalizeMac("GG:BB:CC:DD:EE:FF")).toBeNull();
    expect(normalizeMac("hello there cube")).toBeNull();
  });
});

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("last cube memory", () => {
  it("round-trips a name and forgets it on null", () => {
    const s = fakeStorage();
    expect(readLastCube(s)).toBeNull();
    writeLastCube("  GAN12 ui ", s);
    expect(readLastCube(s)).toBe("GAN12 ui");
    writeLastCube(null, s);
    expect(readLastCube(s)).toBeNull();
  });
  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readLastCube(throwing)).toBeNull();
    expect(() => writeLastCube("x", throwing)).not.toThrow();
  });
});
