"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "play-stored";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A small JSON value kept in localStorage (best scores, the alarm time) —
 * renders the fallback on the server and first paint, then the stored
 * value, with no hydration mismatch. Private mode just doesn't remember.
 */
export function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const on = (e: Event) => {
        if (e instanceof StorageEvent ? e.key === key : (e as CustomEvent<string>).detail === key) cb();
      };
      window.addEventListener("storage", on);
      window.addEventListener(EVENT, on);
      return () => {
        window.removeEventListener("storage", on);
        window.removeEventListener(EVENT, on);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // The fallback is a default, not an input: a new literal each render mustn't re-parse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // not remembered
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );
  return [value, set];
}
