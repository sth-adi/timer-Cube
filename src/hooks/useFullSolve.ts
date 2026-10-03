"use client";

import { useEffect, useState } from "react";
import { getFullSolve } from "@/lib/db/solves";
import type { FullSolve, Solve } from "@/types";

/**
 * The stores hold slim solves — no `gyroStream` — so a screen that plays or analyses a solve's gyro
 * data reads the stored row on demand with these. Rows are cached by id and revision (`updatedAt`):
 * an edit or a sync that changes the row reads it again, anything else is served from memory. The cache
 * is small (a stream is a few tens of KB) and drops the oldest row first.
 */
const CACHE_MAX = 16;
const cache = new Map<string, Promise<FullSolve | undefined>>();

/** The cache key: the id and the revision the caller's slim row has. */
const tokenOf = (s: Pick<Solve, "id" | "updatedAt">) => `${s.id}@${s.updatedAt ?? ""}`;

function loadFullSolve(token: string): Promise<FullSolve | undefined> {
  const hit = cache.get(token);
  if (hit) {
    // Touched: moved to the newest end.
    cache.delete(token);
    cache.set(token, hit);
    return hit;
  }
  const pending = getFullSolve(token.slice(0, token.indexOf("@")));
  cache.set(token, pending);
  // A failed read is not remembered, so the next ask tries again.
  pending.catch(() => cache.delete(token));
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return pending;
}

/** Test-only: forget every cached row. */
export function resetFullSolveCacheForTests() {
  cache.clear();
}

export interface FullSolves {
  /** The stored rows, by id, once `status` is "ready". Ids whose row has gone are absent. */
  rows: ReadonlyMap<string, FullSolve>;
  /** "loading" until every row has been read (and while the list of solves changes), "failed" if the database could not be read. */
  status: "loading" | "ready" | "failed";
}

const NO_ROWS: ReadonlyMap<string, FullSolve> = new Map();

/**
 * The stored rows (gyro streams included) for a few solves, read asynchronously. Pass the slim solves you
 * hold — only their id and revision are used — and keep the list short: this is for the handful a screen
 * is showing, not for a history (use forEachFullSolveChunk for that).
 */
export function useFullSolves(solves: readonly Pick<Solve, "id" | "updatedAt">[]): FullSolves {
  const key = solves.map(tokenOf).join(",");
  const [done, setDone] = useState<{ key: string; rows: ReadonlyMap<string, FullSolve> | null }>({ key: "", rows: null });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(key.split(",").map(loadFullSolve)).then(
      (list) => {
        if (cancelled) return;
        const rows = new Map<string, FullSolve>();
        for (const row of list) if (row) rows.set(row.id, row);
        setDone({ key, rows });
      },
      () => {
        if (!cancelled) setDone({ key, rows: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (!key) return { rows: NO_ROWS, status: "ready" };
  if (done.key !== key) return { rows: NO_ROWS, status: "loading" };
  return done.rows ? { rows: done.rows, status: "ready" } : { rows: NO_ROWS, status: "failed" };
}

/** useFullSolves for one solve: `solve` is its stored row (null once it is gone, or while it loads). Pass null for none. */
export function useFullSolve(solve: Pick<Solve, "id" | "updatedAt"> | null | undefined): { solve: FullSolve | null; status: FullSolves["status"] } {
  const { rows, status } = useFullSolves(solve ? [solve] : []);
  return { solve: solve ? (rows.get(solve.id) ?? null) : null, status };
}
