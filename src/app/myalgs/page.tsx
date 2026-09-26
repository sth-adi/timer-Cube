"use client";

import { useMemo, useState } from "react";
import { BookMarked, Check, Loader2, Printer, RotateCcw } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { useXrayHistory } from "@/components/xray/useXrayHistory";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { buildMicroscope } from "@/lib/xray/algMicroscope";
import { detectMyAlgs, effectiveAlg, myAlgKey, solvesCase } from "@/lib/algorithms/myAlgs";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { AlgCase, AlgGroup } from "@/lib/algorithms/types";
import { cn } from "@/lib/utils/cn";

const s2 = (ms: number) => (ms / 1000).toFixed(2);

function CaseRow({ c, detected }: { c: AlgCase; detected: ReturnType<typeof detectMyAlgs>[string] | undefined }) {
  const key = myAlgKey(c.group, c.name);
  const chosen = useMyAlgsStore((s) => s.chosen[key]);
  const choose = useMyAlgsStore((s) => s.choose);
  const clear = useMyAlgsStore((s) => s.clear);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  const current = chosen ?? c.alg;

  const applyAlg = (alg: string) => {
    if (!solvesCase(c.group, c.alg, alg)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (alg.trim() === c.alg.trim()) clear(key);
    else choose(key, alg.trim());
    setTyped("");
  };

  return (
    <div className="card flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <CaseIcon setupAlg={invertAlg(c.alg)} kind={c.group} className="h-12 w-12 shrink-0 overflow-hidden rounded" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            {c.name}
            <span className={cn("rounded-full px-1.5 py-px text-[9px] font-semibold", chosen ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted-2")}>{chosen ? "yours" : "book"}</span>
          </p>
          <p className="break-words font-mono text-[11px] text-foreground/90">{current}</p>
        </div>
        {chosen && (
          <button type="button" onClick={() => clear(key)} className="shrink-0 text-muted-2 hover:text-foreground" title="Back to the book algorithm" aria-label="Reset to book">
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {detected && detected.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What you actually do</p>
          {detected.slice(0, 3).map((v) => {
            const isCurrent = v.alg.trim() === current.trim();
            return (
              <div key={v.alg} className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 break-words font-mono text-[11px] text-foreground">{v.alg}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted">
                  ×{v.count} · {s2(v.meanExecMs)}s
                </span>
                {isCurrent ? (
                  <Check size={13} className="shrink-0 text-success" />
                ) : (
                  <button type="button" onClick={() => applyAlg(v.alg)} className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
                    Use
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && typed.trim() && applyAlg(typed)}
          placeholder="Or type the algorithm you use"
          className={cn("min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:font-sans placeholder:text-muted-2", bad && "ring-1 ring-danger")}
        />
        <button type="button" onClick={() => applyAlg(typed)} disabled={!typed.trim()} className="rounded-lg bg-bg-panel-2 px-2.5 text-[11px] font-semibold text-foreground disabled:opacity-40">
          Save
        </button>
      </div>
      {bad && <p className="text-[11px] text-danger">That doesn&apos;t solve this case — check the notation (yellow top, green front).</p>}
    </div>
  );
}

/**
 * My Algs: your personal algorithm sheet. The X-Ray reads which
 * algorithm you really execute for each case; pick your main one (or type
 * any, checked against the case) and the Alg Gym, the Sat-Nav and Learn
 * mode use it. Printable, too.
 */
export default function MyAlgsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const chosen = useMyAlgsStore((s) => s.chosen);
  const { results, scanning, done, total } = useXrayHistory(allSolves);
  const detected = useMemo(() => detectMyAlgs(buildMicroscope(results.flatMap((r) => r.executions))), [results]);
  const [group, setGroup] = useState<AlgGroup>("PLL");
  const [onlyMine, setOnlyMine] = useState(false);
  const cases = group === "PLL" ? PLL_CASES : OLL_CASES;
  const seen = cases.filter((c) => detected[myAlgKey(c.group, c.name)]?.length);
  const shown = (onlyMine ? cases.filter((c) => chosen[myAlgKey(c.group, c.name)] || detected[myAlgKey(c.group, c.name)]?.length) : [...seen, ...cases.filter((c) => !seen.includes(c))]).filter(
    (c, i, arr) => arr.indexOf(c) === i,
  );
  const mineCount = Object.keys(chosen).length;

  return (
    <AnalyticsShell icon={<BookMarked size={17} className="text-accent" />} title="My Algs" subtitle="Your algorithms, not the book's — detected from your solves, used everywhere.">
      <div className="print:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-xs">
            {(["PLL", "OLL"] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={cn("px-3 py-1.5 font-semibold", group === g ? "bg-accent text-accent-fg" : "text-muted")}>
                {g}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setOnlyMine((v) => !v)} className={cn("rounded-full px-2.5 py-1.5 text-[11px] font-medium", onlyMine ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}>
              Only mine
            </button>
            <button type="button" onClick={() => window.print()} className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-foreground">
              <Printer size={11} /> Print sheet
            </button>
          </div>
        </div>
        <p className="px-1 text-[11px] text-muted">
          {mineCount ? `${mineCount} case${mineCount === 1 ? " uses" : "s use"} your own algorithm. ` : ""}
          {seen.length ? `${seen.length} ${group} cases seen in your smart-cube solves, most-used variant first.` : `No ${group} executions read from your smart-cube solves yet.`}
          {scanning && (
            <span className="ml-1 inline-flex items-center gap-1 text-muted-2">
              <Loader2 size={10} className="animate-spin" /> reading {done}/{total}
            </span>
          )}
        </p>
        {shown.map((c) => (
          <CaseRow key={c.id} c={c} detected={detected[myAlgKey(c.group, c.name)]} />
        ))}
      </div>

      {/* The printable sheet: every case, your algorithm or the book's. */}
      <div className="hidden print:block">
        {(["PLL", "OLL"] as const).map((g) => (
          <div key={g} className="mb-4 break-inside-avoid">
            <h2 className="mb-2 text-base font-bold text-black">{g}</h2>
            <div className="grid grid-cols-2 gap-2">
              {(g === "PLL" ? PLL_CASES : OLL_CASES).map((c) => (
                <div key={c.id} className="flex items-center gap-2 break-inside-avoid border border-gray-300 p-1.5 text-black">
                  <CaseIcon setupAlg={invertAlg(c.alg)} kind={c.group} className="h-10 w-10 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold">{c.name}</p>
                    <p className="font-mono text-[9px]">{effectiveAlg(chosen, c.group, c.name, c.alg)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AnalyticsShell>
  );
}
