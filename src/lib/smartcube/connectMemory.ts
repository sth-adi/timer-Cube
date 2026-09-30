/**
 * Small conveniences for the connect screen: normalising a hand-typed
 * Bluetooth address, and remembering which cube you used last so the next
 * visit can offer to reconnect to that one instead of making you pick it
 * out of every Bluetooth device in the room. (The Bluetooth address itself
 * is cached by the connection library once it has been verified.)
 */

const LAST_CUBE_KEY = "cube-timer-last-cube";

/** "aa:bb:cc:dd:ee:ff", "AA-BB-CC-DD-EE-FF", "aabbccddeeff" → "AA:BB:CC:DD:EE:FF"; null if it isn't six bytes of hex. */
export function normalizeMac(input: string): string | null {
  const hex = input.trim().replace(/[\s:.-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return hex
    .toUpperCase()
    .match(/.{2}/g)!
    .join(":");
}

export function readLastCube(storage: Pick<Storage, "getItem"> | null = safeStorage()): string | null {
  try {
    const v = storage?.getItem(LAST_CUBE_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function writeLastCube(name: string | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (name && name.trim()) storage?.setItem(LAST_CUBE_KEY, name.trim());
    else storage?.removeItem(LAST_CUBE_KEY);
  } catch {
    // Private mode: it just isn't remembered.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
