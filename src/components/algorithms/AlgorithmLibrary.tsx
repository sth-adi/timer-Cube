"use client";

import { useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import type { AlgCase } from "@/lib/algorithms/types";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { deriveStatus } from "@/lib/algorithms/srs";
import { cn } from "@/lib/utils/cn";
import { CaseDetailSheet } from "./CaseDetailSheet";

const STATUS_DOT = { new: "bg-muted-2", learning: "bg-warning", known: "bg-success" } as const;

function CaseCard({ algCase, onOpen }: { algCase: AlgCase; onOpen: () => void }) {
  const progress = useAlgorithmStore((s) => s.progress[algCase.id]);
  const status = deriveStatus(progress);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex flex-col items-start gap-1.5 rounded-lg p-3 text-left transition-colors hover:bg-bg-panel-2"
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-medium">{algCase.name}</span>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      </div>
      {algCase.shape && <span className="text-muted-2 text-xs">{algCase.shape}</span>}
    </button>
  );
}

export function AlgorithmLibrary({ onStartReview }: { onStartReview: () => void }) {
  const [group, setGroup] = useState<"PLL" | "OLL">("PLL");
  const [openCase, setOpenCase] = useState<AlgCase | null>(null);
  const dueCaseIds = useAlgorithmStore((s) => s.dueCaseIds);
  // Re-derive on every render (cheap, ~78 items) rather than caching — progress mutates via the store.
  const due = dueCaseIds();

  const cases = group === "PLL" ? PLL_CASES : OLL_CASES;
  const grouped = useMemo(() => {
    const map = new Map<string, AlgCase[]>();
    for (const c of cases) {
      const key = c.shape ?? c.group;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()];
  }, [cases]);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="card flex items-center justify-between rounded-xl p-4">
        <div>
          <p className="text-sm font-medium">{due.length} due for review</p>
          <p className="text-muted-2 text-xs">across {ALL_CASES_COUNT} PLL + OLL cases</p>
        </div>
        <button
          type="button"
          onClick={onStartReview}
          disabled={due.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent disabled:opacity-40"
        >
          <RotateCw size={14} /> Review
        </button>
      </div>

      <div className="flex gap-2">
        {(["PLL", "OLL"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              group === g ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {grouped.map(([shape, items]) => (
        <div key={shape} className="card rounded-xl p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-2">{shape}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((c) => (
              <CaseCard key={c.id} algCase={c} onOpen={() => setOpenCase(c)} />
            ))}
          </div>
        </div>
      ))}

      {openCase && <CaseDetailSheet algCase={openCase} onClose={() => setOpenCase(null)} />}
    </div>
  );
}

const ALL_CASES_COUNT = PLL_CASES.length + OLL_CASES.length;
