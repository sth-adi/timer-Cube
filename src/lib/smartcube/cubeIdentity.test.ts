import { describe, expect, it } from "vitest";
import { cubeIdentity } from "./cubeIdentity";

describe("cubeIdentity", () => {
  it("prefers the MAC, normalised, so the same cube is always the same id", () => {
    const a = cubeIdentity({ deviceMac: "aa:bb:cc:dd:ee:ff", deviceName: "GAN12 ui", protocolName: "GAN Gen4" });
    const b = cubeIdentity({ deviceMac: "AA:BB:CC:DD:EE:FF", deviceName: "GAN12 ui FreePlay", protocolName: "GAN Gen4" });
    expect(a?.id).toBe("mac:AA:BB:CC:DD:EE:FF");
    expect(b?.id).toBe(a?.id);
  });
  it("falls back to the advertised name when no MAC was resolved", () => {
    expect(cubeIdentity({ deviceMac: null, deviceName: "MoYu32", protocolName: null })).toEqual({ id: "name:MoYu32", name: "MoYu32" });
  });
  it("is null with no name to go on", () => {
    expect(cubeIdentity({ deviceMac: "AA:BB", deviceName: null, protocolName: null })).toBeNull();
    expect(cubeIdentity({ deviceMac: "AA:BB", deviceName: "  ", protocolName: null })).toBeNull();
  });
});
