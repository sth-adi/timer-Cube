import { describe, expect, it } from "vitest";
import { describeConnectError, friendlyConnectError } from "./friendlyConnectError";

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

  it("tells a wrong hand-typed address apart from a missing one", () => {
    const wrong = friendlyConnectError("Timed out waiting for cube data. Check the Bluetooth MAC address and try again.");
    expect(wrong).toMatch(/didn't answer with that Bluetooth address/i);
    expect(friendlyConnectError("Unable to determine cube MAC address, connection is not possible!")).toMatch(/couldn't identify/i);
  });

  it("passes an unrecognized message through unchanged", () => {
    expect(friendlyConnectError("Some brand-new failure mode")).toBe("Some brand-new failure mode");
  });

  // Every pattern, with message shapes as the drivers and Chrome word them (case varies in the wild).
  const TABLE: [name: string, raw: string[], expected: RegExp][] = [
    ["hand-typed address timed out", ["Timed out waiting for cube data. Check the Bluetooth MAC address and try again."], /didn't answer with that Bluetooth address/i],
    ["MAC address unresolved", ["Unable to determine cube MAC address, connection is not possible!", "UNABLE TO DETERMINE QIYI CUBE MAC ADDRESS"], /couldn't identify/i],
    ["unsupported model", ["Can't find target BLE services - wrong or unsupported cube device model", "NO SMARTCUBE PROTOCOLS REGISTERED"], /supported smart cube/i],
    ["GATT timeout/unavailable", ["GATT connection timeout", "gatt UNAVAILABLE"], /stable Bluetooth connection/i],
    ["protocol mismatch", ["[QiYi] Cannot find required characteristic", "cannot find required CHARACTERISTIC"], /didn't respond the way/i],
    [
      "adapter off or missing",
      ["NotFoundError: Bluetooth adapter not available.", "bluetooth adapter is off", "Bluetooth is turned off", "BLUETOOTH ADAPTER NOT AVAILABLE"],
      /Turn Bluetooth on, then try again\./,
    ],
    [
      "permission blocked",
      [
        "NotAllowedError: User denied the browser permission to scan for Bluetooth devices.",
        "Web Bluetooth permission has been blocked.",
        "NotAllowedError: Permission denied",
        "Access to the Bluetooth device is disallowed by permissions policy",
      ],
      /Allow Bluetooth for this site in your browser's site settings/,
    ],
    [
      "asleep or out of range",
      [
        "NetworkError: GATT operation failed for unknown reason.",
        "NetworkError: Failed to execute 'connect' on 'BluetoothRemoteGATTServer': Connection attempt failed.",
        "GATT Server is disconnected. Cannot perform GATT operations.",
        "Device is no longer in range.",
        "networkerror: something else",
      ],
      /asleep or out of range\. Turn a face to wake it/,
    ],
  ];

  describe.each(TABLE)("%s", (_name, raws, expected) => {
    it.each(raws)("rewords %j and keeps the original as detail", (raw) => {
      expect(friendlyConnectError(raw)).toMatch(expected);
      expect(describeConnectError(raw)).toEqual({ message: friendlyConnectError(raw), detail: raw });
    });
  });

  it("leaves a user-cancelled chooser alone, even when it names Bluetooth or permissions", () => {
    for (const raw of [
      "NotFoundError: User cancelled the requestDevice() dialog.",
      "Chooser was cancelled",
      "NotAllowedError: Must be handling a user gesture to show a permission request.",
      "The operation was aborted: Bluetooth adapter not available",
    ]) {
      expect(friendlyConnectError(raw)).toBe(raw);
      expect(describeConnectError(raw).detail).toBeNull();
    }
  });

  it("gives every reworded message something to do", () => {
    for (const [, raws] of TABLE) expect(friendlyConnectError(raws[0])).toMatch(/try again|re-pair|reconnecting|check you picked/i);
  });

  it("has no technical detail for a message that passed through", () => {
    expect(describeConnectError("Some brand-new failure mode")).toEqual({ message: "Some brand-new failure mode", detail: null });
  });
});
