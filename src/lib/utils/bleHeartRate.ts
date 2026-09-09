/**
 * Parses the standard Bluetooth GATT Heart Rate Measurement characteristic
 * (service 0x180D, characteristic 0x2A37) — the same characteristic every
 * BLE chest strap and most fitness watches expose, per the Bluetooth SIG's
 * published Heart Rate Service spec. Pure and separate from the connection
 * code so the byte-level parsing is testable without real hardware.
 */

export interface HeartRateMeasurement {
  bpm: number;
  /** Whether the sensor reports it's actually making skin contact, when that field is present. */
  contactDetected: boolean | null;
}

export function parseHeartRateMeasurement(data: DataView): HeartRateMeasurement {
  const flags = data.getUint8(0);
  const bpmIsUint16 = (flags & 0x01) !== 0;
  const contactFeaturePresent = (flags & 0x04) !== 0;
  const contactDetected = contactFeaturePresent ? (flags & 0x02) !== 0 : null;

  const bpm = bpmIsUint16 ? data.getUint16(1, /* littleEndian */ true) : data.getUint8(1);

  return { bpm, contactDetected };
}
