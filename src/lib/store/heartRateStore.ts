"use client";

import { create } from "zustand";
import { parseHeartRateMeasurement } from "@/lib/utils/bleHeartRate";
import { summarizeHeartRate, type HeartRateSample, type HeartRateSummary } from "@/lib/utils/heartRateStats";

/**
 * Connects a standard BLE Heart Rate strap (the same GATT Heart Rate Service
 * every chest strap and most fitness watches expose — not cube-specific
 * hardware) and logs a live sample stream, so a solve's heart rate can be
 * correlated with its performance: did the pressure of a PB attempt actually
 * show up as a spike, or did you stay calm through it.
 */

const HEART_RATE_SERVICE = "heart_rate";
const HEART_RATE_MEASUREMENT = "heart_rate_measurement";
/** How much sample history to keep — enough for a very long practice session without growing unbounded. */
const MAX_SAMPLES = 20_000;

interface HeartRateState {
  supported: boolean;
  connecting: boolean;
  connected: boolean;
  deviceName: string | null;
  error: string | null;
  bpm: number | null;
  samples: HeartRateSample[];
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Average/max bpm from `startMs` (a solve's start time) to now. */
  summarize: (startMs: number) => HeartRateSummary | null;
}

let gattServer: BluetoothRemoteGATTServer | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

export const useHeartRateStore = create<HeartRateState>((set, get) => ({
  supported: typeof navigator !== "undefined" && "bluetooth" in navigator,
  connecting: false,
  connected: false,
  deviceName: null,
  error: null,
  bpm: null,
  samples: [],

  connect: async () => {
    if (!get().supported) {
      set({ error: "This browser doesn't support Web Bluetooth (try Chrome, Edge, or Android)." });
      return;
    }
    set({ connecting: true, error: null });
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
      });
      device.addEventListener("gattserverdisconnected", () => {
        gattServer = null;
        characteristic = null;
        set({ connected: false, deviceName: null, bpm: null });
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error("Couldn't open a GATT connection to that device.");
      gattServer = server;

      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      characteristic = char;

      char.addEventListener("characteristicvaluechanged", () => {
        const value = char.value;
        if (!value) return;
        const { bpm } = parseHeartRateMeasurement(value);
        set((s) => ({
          bpm,
          samples: [...s.samples, { timestampMs: Date.now(), bpm }].slice(-MAX_SAMPLES),
        }));
      });
      await char.startNotifications();

      set({ connected: true, connecting: false, deviceName: device.name ?? "Heart rate monitor" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ connecting: false, error: /cancelled|user gesture/i.test(message) ? null : message });
    }
  },

  disconnect: () => {
    // Explicitly stop notifications before tearing down the connection —
    // disconnect() alone drops the link, but this is the well-behaved
    // order and avoids a dangling subscription if the same device is
    // reconnected to later in this page's lifetime.
    void characteristic?.stopNotifications().catch(() => {});
    gattServer?.disconnect();
    gattServer = null;
    characteristic = null;
    set({ connected: false, deviceName: null, bpm: null });
  },

  summarize: (startMs) => summarizeHeartRate(get().samples, startMs),
}));
