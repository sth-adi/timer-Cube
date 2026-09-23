"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Shapes } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { F2lCaseIcon } from "@/components/algorithms/F2lCaseIcon";
import { useSessionStore } from "@/lib/store/sessionStore";
import { caseStats, solveCases, type CaseGroup, type CaseStat } from "@/lib/analysis/caseHistory";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { cn } from "@/lib/utils/cn";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}`;
const GROUPS: CaseGroup[] = ["OLL", "PLL", "F2L"];
const SORTS = [
  { key: "count", label: "Most seen" },
  { key: "total", label: "Slowest" },
  { key: "look", label: "Slowest to recognise" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

function Icon({ stat, className }: { stat: Pick<CaseStat, "group" | "name" | "f2l">; className: string }) {
  if (stat.group === "F2L") return stat.f2l ? <F2lCaseIcon facelets={stat.f2l.facelets} pairFacelets={stat.f2l.pairFacelets} className={className} /> : null;
  const c = findCase(stat.group, stat.name);
  return c ? <CaseIcon setupAlg={invertAlg(c.alg)} kind={stat.group} className={cn(className, "overflow-hidden rounded-[4px]")} /> : null;
}

function CaseRow({ stat, maxTotal }: { stat: CaseStat; maxTotal: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card rounded-xl">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <Icon stat={stat} className="h-11 w-11 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{stat.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {stat.count}× <span className="text-muted-2">· {(stat.share * 100).toFixed(1)}%</span>
            </span>
          </p>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-bg-panel-2">
            <div className="h-full bg-warning/50" style={{ width: `${(stat.recognitionMs / maxTotal) * 100}%` }} />
            <div className="h-full bg-accent" style={{ width: `${(stat.executionMs / maxTotal) * 100}%` }} />
          </div>
          <p className="text-[11px] tabular-nums text-muted-2">
            <span className="text-muted">{secs(stat.recognitionMs)}</span> recognise + <span className="text-muted">{secs(stat.executionMs)}</span> execute ={" "}
            <span className="font-medium text-foreground">{secs(stat.totalMs)}s</span> avg
          </p>
        </div>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-2 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
            Best {secs(stat.bestTotalMs)}s · last {Math.min(10, stat.occurrences.length)} times
          </p>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px] tabular-nums">
            <span className="text-muted-2">When</span>
            <span className="text-right text-muted-2">Recognise</span>
            <span className="text-right text-muted-2">Execute</span>
            <span className="text-right text-muted-2">Total</span>
            {stat.occurrences.slice(0, 10).map((o, i) => (
              <div key={`${o.solveId}-${i}`} className="contents">
                <span className="text-muted">{new Date(o.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span className="text-right text-muted">{secs(o.recognitionMs)}</span>
                <span className="text-right text-muted">{secs(o.executionMs)}</span>
                <span className="text-right font-medium text-foreground">{secs(o.recognitionMs + o.executionMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Every case you've had, from every smart-cube solve: how often each one
 * comes up, and how long you take to recognise it versus turn it.
 */
export default function CasesPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const [group, setGroup] = useState<CaseGroup>("OLL");
  const [sort, setSort] = useState<SortKey>("count");
  const [showUnseen, setShowUnseen] = useState(false);

  const occurrences = useMemo(() => allSolves.flatMap(solveCases), [allSolves]);
  const { stats, total } = useMemo(() => {
    // A solve has at most one OLL and one PLL (skips aren't cases), so shares
    // are out of your OLLs / PLLs / F2L pairs.
    const n = occurrences.filter((o) => o.group === group).length;
    return { stats: caseStats(occurrences, group, n), total: n };
  }, [occurrences, group]);

  const sorted = useMemo(() => {
    const list = [...stats];
    if (sort === "total") list.sort((a, b) => b.totalMs - a.totalMs);
    if (sort === "look") list.sort((a, b) => b.recognitionMs - a.recognitionMs);
    return list;
  }, [stats, sort]);
  const maxTotal = Math.max(1, ...stats.map((s) => s.totalMs));
  const library = group === "OLL" ? OLL_CASES : group === "PLL" ? PLL_CASES : [];
  const unseen = library.filter((c) => !stats.some((s) => s.key === c.name));

  return (
    <AnalyticsShell
      icon={<Shapes size={17} className="text-accent" />}
      title="Case history"
      subtitle="Every OLL, PLL and F2L case from your smart-cube solves: how often it comes up, and how long you take to recognise it versus turn it."
    >
      <div className="flex rounded-full bg-bg-panel-2 p-1">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold", group === g ? "bg-accent text-accent-fg" : "text-muted")}
          >
            {g}
          </button>
        ))}
      </div>

      {stats.length === 0 ? (
        <div className="card rounded-xl p-6 text-center text-sm text-muted">
          No {group} cases yet — solve on a connected smart cube and each one is logged here automatically.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-muted">
              {total} {group === "F2L" ? "pairs" : `${group}s`} · {stats.length}
              {library.length ? ` of ${library.length}` : ""} cases seen
            </p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-foreground"
              aria-label="Sort cases"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            {sorted.map((s) => (
              <CaseRow key={s.key} stat={s} maxTotal={maxTotal} />
            ))}
          </div>

          <p className="flex items-center justify-center gap-3 text-[10px] text-muted-2">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-full bg-warning/50" /> recognising
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-full bg-accent" /> turning
            </span>
          </p>

          {unseen.length > 0 && (
            <div className="card rounded-xl p-3">
              <button type="button" onClick={() => setShowUnseen((v) => !v)} className="flex w-full items-center justify-between text-xs font-medium text-muted">
                Not seen yet ({unseen.length})
                <ChevronDown size={13} className={cn("transition-transform", showUnseen && "rotate-180")} />
              </button>
              {showUnseen && (
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {unseen.map((c) => (
                    <div key={c.name} className="flex flex-col items-center gap-0.5 opacity-60" title={c.name}>
                      <Icon stat={{ group, name: c.name }} className="h-9 w-9" />
                      <span className="w-full truncate text-center text-[9px] text-muted-2">{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AnalyticsShell>
  );
}
