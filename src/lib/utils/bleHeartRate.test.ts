import { describe, expect, it } from "vitest";
import { parseHeartRateMeasurement } from "./bleHeartRate";

function bytes(...values: number[]): DataView {
  return new DataView(new Uint8Array(values).buffer);
}

describe("parseHeartRateMeasurement", () => {
  it("parses a UINT8 bpm value (flag bit 0 clear)", () => {
    // flags=0 (uint8 bpm, no contact feature), bpm=72
    const r = parseHeartRateMeasurement(bytes(0b00000000, 72));
    expect(r.bpm).toBe(72);
    expect(r.contactDetected).toBeNull();
  });

  it("parses a UINT16 little-endian bpm value (flag bit 0 set)", () => {
    // flags=1 (uint16 bpm), bpm=300 (0x012C) little-endian: 0x2C, 0x01
    const r = parseHeartRateMeasurement(bytes(0b00000001, 0x2c, 0x01));
    expect(r.bpm).toBe(300);
  });

  it("reads sensor-contact status when the feature bit is present", () => {
    // flags: contact feature present (bit2) + detected (bit1) = 0b110 = 6
    const detected = parseHeartRateMeasurement(bytes(0b00000110, 65));
    expect(detected.contactDetected).toBe(true);

    // contact feature present but not detected: bit2 set, bit1 clear = 0b100 = 4
    const notDetected = parseHeartRateMeasurement(bytes(0b00000100, 65));
    expect(notDetected.contactDetected).toBe(false);
  });

  it("reports contactDetected as null when the device doesn't support the feature", () => {
    const r = parseHeartRateMeasurement(bytes(0b00000000, 65));
    expect(r.contactDetected).toBeNull();
  });
});
