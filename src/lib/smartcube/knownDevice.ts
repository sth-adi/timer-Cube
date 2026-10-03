import type { SmartCubeConnection, SmartCubeProtocol } from "smartcube-web-bluetooth";

/**
 * Getting back to a cube the browser has already let this page use, without
 * the device chooser. The chooser (navigator.bluetooth.requestDevice) needs a
 * click; reconnecting to a BluetoothDevice the page already holds
 * (device.gatt.connect()) doesn't — so the device is kept from the original
 * connect, and an auto-reconnect redoes only the part of the connection
 * library's connectSmartCube() that comes after the chooser.
 *
 * The page holds that device only until it's reloaded. After that,
 * navigator.bluetooth.getDevices() can hand it back, but Chrome only offers
 * that with its newer Bluetooth permissions (on by default in some builds,
 * behind chrome://flags/#enable-web-bluetooth-new-permissions-backend in
 * others); without it there is nothing to reconnect to silently and the
 * connect screen's one-tap Reconnect is the way back.
 */

/**
 * Runs `run` (a connectSmartCube call) and records which device the user
 * picked in the chooser it opens. The library doesn't hand the device back,
 * so requestDevice is wrapped for the duration of the call and restored
 * afterwards; it's never called here, only observed.
 */
export async function captureChosenDevice<T>(run: () => Promise<T>): Promise<{ value: T; device: BluetoothDevice | null }> {
  const bluetooth = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!bluetooth || typeof bluetooth.requestDevice !== "function") return { value: await run(), device: null };
  let device: BluetoothDevice | null = null;
  const hadOwn = Object.prototype.hasOwnProperty.call(bluetooth, "requestDevice");
  const original = bluetooth.requestDevice;
  try {
    Object.defineProperty(bluetooth, "requestDevice", {
      configurable: true,
      writable: true,
      value: async (options?: RequestDeviceOptions) => {
        const chosen = await original.call(bluetooth, options);
        device = chosen;
        return chosen;
      },
    });
  } catch {
    // Not wrappable here: the connection still works, it just can't be resumed silently.
    return { value: await run(), device: null };
  }
  try {
    return { value: await run(), device };
  } finally {
    if (hadOwn) Object.defineProperty(bluetooth, "requestDevice", { configurable: true, writable: true, value: original });
    else delete (bluetooth as unknown as Record<string, unknown>).requestDevice;
  }
}

/** A device this page is already allowed to use, by name — via getDevices(), where the browser offers it. */
export async function findPermittedDevice(name: string | null): Promise<BluetoothDevice | null> {
  const bluetooth = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!name || !bluetooth || typeof bluetooth.getDevices !== "function") return null;
  try {
    const devices = await bluetooth.getDevices();
    return devices.find((d) => d.name === name) ?? null;
  } catch {
    return null;
  }
}

/** Same normalisation the library applies to service UUIDs before its protocols score them. */
function normalizeUuid(uuid: string): string {
  return (/^[0-9A-Fa-f]{4}$/.test(uuid) ? `0000${uuid}-0000-1000-8000-00805F9B34FB` : uuid).toUpperCase();
}

/** The protocol whose GATT profile fits best, tie-broken by name — the library's own rule. */
export function pickProtocol(protocols: readonly SmartCubeProtocol[], serviceUuids: ReadonlySet<string>, device: BluetoothDevice): SmartCubeProtocol | null {
  let best: SmartCubeProtocol | null = null;
  let bestScore = 0;
  let bestNamed = false;
  for (const p of protocols) {
    const score = p.gattAffinity(serviceUuids, device);
    if (score <= 0) continue;
    const named = p.matchesDevice(device);
    if (score > bestScore || (score === bestScore && named && !bestNamed)) {
      best = p;
      bestScore = score;
      bestNamed = named;
    }
  }
  return best ?? protocols.find((p) => p.matchesDevice(device)) ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("Timed out reaching the cube"));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** How long one silent attempt may spend reaching the cube before it counts as a miss. */
const GATT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Connects to a device the page already holds, without the chooser. Aborting
 * stops it at the next step but leaves the link alone (see disconnectQuietly). The
 * cube's Bluetooth address (which GAN, QiYi and MoYu32 need) comes from the
 * library's own cache, filled when this cube first connected — nothing here
 * asks for it, so a cube whose address was never cached just fails the
 * attempt rather than putting up a prompt nobody asked for.
 */
export async function connectKnownDevice(device: BluetoothDevice, opts: { signal: AbortSignal; onStatus?: (message: string) => void }): Promise<SmartCubeConnection> {
  const gatt = device.gatt;
  if (!gatt) throw new Error("GATT unavailable on this device");
  const { getRegisteredProtocols } = await import("smartcube-web-bluetooth");
  // Once aborted the link is the caller's to decide about: a connect by hand
  // may be using this same device now, and dropping it would cut that off.
  const disconnectQuietly = () => {
    if (opts.signal.aborted) return;
    try {
      gatt.disconnect();
    } catch {
      // already gone
    }
  };
  const abortIfCancelled = () => {
    if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
  };

  opts.onStatus?.("Connecting…");
  await withTimeout(gatt.connected ? Promise.resolve(gatt) : gatt.connect(), GATT_CONNECT_TIMEOUT_MS, disconnectQuietly);
  abortIfCancelled();
  let serviceUuids: Set<string>;
  try {
    const services = await gatt.getPrimaryServices();
    serviceUuids = new Set(services.map((s) => normalizeUuid(s.uuid)));
  } catch (e) {
    disconnectQuietly();
    throw e;
  }
  abortIfCancelled();

  const protocol = pickProtocol(getRegisteredProtocols(), serviceUuids, device);
  if (!protocol) {
    disconnectQuietly();
    throw new Error("Selected device doesn't match any registered smartcube protocol");
  }
  try {
    return await protocol.connect(device, async () => null, { serviceUuids, onStatus: opts.onStatus, signal: opts.signal });
  } catch (e) {
    disconnectQuietly();
    throw e;
  }
}
