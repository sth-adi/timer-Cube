import { describe, expect, it } from "vitest";
import { friendlyConnectError } from "./friendlyConnectError";

describe("friendlyConnectError", () => {
  it("rewords the GAN/MoYu32 MAC-resolution failure", () => {
    expect(friendlyConnectError("Unable to determine cube MAC address, connection is not possible!")).toMatch(/Bluetooth address/i);
    expect(friendlyConnectError("Unable to determine QiYi cube MAC address")).toMatch(/Bluetooth address/i);
    expect(friendlyConnectError("Unable to determine MoYu32 cube MAC address")).toMatch(/Bluetooth address/i);
  });

  it("rewords an unsupported/unrecognized device model", () => {
    expect(friendlyConnectError("Can't find target BLE services - wrong or unsupported cube device model")).toMatch(/supported smart cube/i);
    expect(friendlyConnectError("Selected device doesn't match any registered smartcube protocol")).toMatch(/supported smart cube/i);
    expect(friendlyConnectError("No smartcube protocols registered")).toMatch(/supported smart cube/i);
  });

  it("rewords a GATT-level connection failure", () => {
    expect(friendlyConnectError("GATT connection timeout")).toMatch(/stable Bluetooth connection/i);
    expect(friendlyConnectError("GATT unavailable on this device")).toMatch(/stable Bluetooth connection/i);
  });

  it("rewords a missing-characteristic protocol mismatch", () => {
    expect(friendlyConnectError("[QiYi] Cannot find required characteristic")).toMatch(/didn't respond the way/i);
  });

  it("passes an unrecognized message through unchanged", () => {
    expect(friendlyConnectError("Some brand-new failure mode")).toBe("Some brand-new failure mode");
  });
});
