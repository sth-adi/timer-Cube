"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { MAIN_AFTER, myAlgKey, normalizedAlg } from "@/lib/algorithms/myAlgs";
import type { AlgCase } from "@/lib/algorithms/types";
import { cn } from "@/lib/utils/cn";

const s2 = (ms: number) => (ms / 1000).toFixed(2);

/**
 * The algorithms you actually do for a case, learned from your smart-cube
 * solves (one-look executions only), next to the book's — with which one
 * the app uses as your main, and a way to change or remove each.
 */
export function YourAlgs({ algCase, onShow, showing }: { algCase: AlgCase; onShow?: (alg: string) => void; showing?: string }) {
  const key = myAlgKey(algCase.group, algCase.name);
  const seen = useMyAlgsStore((s) => s.seen[key]);
  const chosen = useMyAlgsStore((s) => s.chosen[key]);
  const manual = useMyAlgsStore((s) => s.manualKeys.includes(key));
  const choose = useMyAlgsStore((s) => s.choose);
  const clear = useMyAlgsStore((s) => s.clear);
  const dismiss = useMyAlgsStore((s) => s.dismiss);
  const main = chosen ?? algCase.alg;
  const mainNorm = normalizedAlg(main);
  const list = seen ?? [];
  const bookSeen = list.find((x) => x.book);
  const yours = list.filter((x) => !x.book);

  const row = (alg: string, opts: { book: boolean; count?: number; meanMs?: number; bestMs?: number }) => {
    const isMain = normalizedAlg(alg) === mainNorm;
    return (
      <div key={alg} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", isMain ? "bg-accent-soft" : "bg-bg-panel-2")}>
        <button type="button" onClick={() => onShow?.(alg)} className="min-w-0 flex-1 text-left" disabled={!onShow}>
          <p className={cn("break-words font-mono text-[11px]", showing === alg ? "text-accent" : "text-foreground")}>{alg}</p>
          <p className="text-[10px] text-muted-2">
            {opts.book ? "book" : "yours"}
            {opts.count ? ` · done ×${opts.count}` : ""}
            {opts.meanMs ? ` · ${s2(opts.meanMs)}s avg, ${s2(opts.bestMs!)}s best` : ""}
          </p>
        </button>
        {isMain ? (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-accent">
            <Check size={11} /> main
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (opts.book ? clear(key) : choose(key, alg))}
            className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg"
          >
            Make main
          </button>
        )}
        {!opts.book && (
          <button type="button" onClick={() => dismiss(key, alg)} aria-label="Remove this algorithm" className="shrink-0 text-muted-2 hover:text-danger">
            <X size={12} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
        <Sparkles size={10} className="text-accent" /> Your algorithms
      </p>
      {row(algCase.alg, { book: true, count: bookSeen?.count, meanMs: bookSeen?.meanExecMs, bestMs: bookSeen?.bestExecMs })}
      {yours.map((x) => row(x.alg, { book: false, count: x.count, meanMs: x.meanExecMs, bestMs: x.bestExecMs }))}
      {chosen && !yours.some((x) => normalizedAlg(x.alg) === mainNorm) && mainNorm !== normalizedAlg(algCase.alg) && row(chosen, { book: false })}
      <p className="text-[10px] leading-snug text-muted-2">
        {yours.length
          ? manual
            ? "You picked the main one yourself — it stays until you change it."
            : `Learned from your smart-cube solves (one-look only). The one you use most becomes your main after ${MAIN_AFTER} solves — the Alg Gym and the Sat-Nav use it.`
          : "Solve this case in one look on a smart cube with an algorithm of your own and it appears here."}
      </p>
    </div>
  );
}
