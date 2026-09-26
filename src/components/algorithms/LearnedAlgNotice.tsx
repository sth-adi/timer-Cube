"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";

/**
 * "New algorithm learned" for the solve that just finished: shown when that
 * solve's OLL or PLL was done in one look with an algorithm that isn't the
 * book's, the first time it's seen.
 */
export function LearnedAlgNotice({ solveDate }: { solveDate: number | null }) {
  const recent = useMyAlgsStore((s) => s.recent);
  const learned = solveDate === null ? [] : recent.filter((r) => r.at === solveDate);
  if (!learned.length) return null;
  return (
    <div className="card flex w-full flex-col gap-1.5 rounded-xl p-3 ring-1 ring-accent/40">
      {learned.map((r) => (
        <div key={r.key + r.alg} className="flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-foreground">
              New {r.group} algorithm learned: {r.caseName}
            </p>
            <p className="break-words font-mono text-[11px] text-muted">{r.alg}</p>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-2">
        Added to the case as yours — do it again and it becomes your main algorithm.{" "}
        <Link href="/myalgs" className="text-accent hover:underline">
          My Algs →
        </Link>
      </p>
    </div>
  );
}
