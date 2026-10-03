const KEY = "cube-timer:storage-persist";

export type PersistOutcome = "granted" | "denied";

export function readPersistOutcome(): PersistOutcome | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

let asked = false;

/**
 * Asks the browser not to evict this site's IndexedDB under storage pressure — without it a
 * device that runs low on space can silently drop every solve. Once per device: the outcome is
 * remembered, so a "no" isn't re-asked on every solve (some browsers show a prompt for it).
 * Best-effort and never throws; browsers without the Storage API just keep best-effort storage.
 */
export async function requestPersistentStorage(): Promise<PersistOutcome | null> {
  const known = readPersistOutcome();
  if (known) return known;
  if (asked) return null;
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage?.persist) return null;
  asked = true;
  try {
    const granted = (await storage.persisted?.()) || (await storage.persist());
    const outcome: PersistOutcome = granted ? "granted" : "denied";
    try {
      localStorage.setItem(KEY, outcome);
    } catch {
      // Not remembered — it is asked again next visit.
    }
    return outcome;
  } catch {
    asked = false;
    return null;
  }
}

/** Test hook: forgets that this page already asked. */
export function resetPersistRequestForTests(): void {
  asked = false;
}
