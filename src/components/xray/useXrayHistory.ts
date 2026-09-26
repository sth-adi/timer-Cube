"use client";

import { useEffect, useMemo, useState } from "react";
import { isXrayable, runXray, xrayRequestFor } from "@/lib/xray/client";
import type { SolveXray } from "@/lib/xray/solveXray";
import type { Solve } from "@/types";

/** Solves the history scan reads (cheap analyses). */
export const HISTORY_LIMIT = 80;
/** Of those, how many recent ones also get a (lighter) Last Slot Oracle search. */
const ORACLE_HISTORY_LIMIT = 15;

/**
 * X-Rays your most recent smart-cube solves one at a time through the
 * worker, streaming results in as they finish — shared by the X-Ray page
 * and the Coach, which ranks what it finds.
 */
export function useXrayHistory(allSolves: readonly Solve[]) {
  const candidates = useMemo(() => allSolves.filter(isXrayable).sort((a, b) => b.date - a.date), [allSolves]);
  const historyKey = candidates
    .slice(0, HISTORY_LIMIT)
    .map((s) => s.id)
    .join(",");
  const [history, setHistory] = useState<{ key: string; results: SolveXray[]; done: number }>({ key: "", results: [], done: 0 });
  useEffect(() => {
    const batch = candidates.slice(0, HISTORY_LIMIT);
    if (batch.length === 0) return;
    let cancelled = false;
    (async () => {
      const results: SolveXray[] = [];
      for (let i = 0; i < batch.length; i++) {
        if (cancelled) return;
        const req = xrayRequestFor(batch[i], i < ORACLE_HISTORY_LIMIT ? { oracle: { extraDepth: 1 } } : { skipOracle: true });
        try {
          results.push(await runXray(req));
        } catch {
          // A solve the X-Ray can't read just doesn't count toward history.
        }
        if (!cancelled && (i % 5 === 4 || i === batch.length - 1)) setHistory({ key: historyKey, results: [...results], done: i + 1 });
      }
    })();
    return () => {
      cancelled = true;
    };
    // historyKey captures exactly which solves are in the batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);
  const results = useMemo(() => (history.key === historyKey ? history.results : []), [history, historyKey]);
  const done = history.key === historyKey ? history.done : 0;
  const total = Math.min(HISTORY_LIMIT, candidates.length);
  return { candidates, results, done, total, scanning: candidates.length > 0 && done < total };
}
