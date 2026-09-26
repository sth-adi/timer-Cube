"use client";

import { useMemo, useState } from "react";
import { BookMarked, Loader2, Printer } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { YourAlgs } from "@/components/algorithms/YourAlgs";
import { analyzableSolves } from "@/lib/analytics/solveMetrics";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { effectiveAlg, myAlgKey, solvesCase } from "@/lib/algorithms/myAlgs";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { AlgCase, AlgGroup } from "@/lib/algorithms/types";
import { cn } from "@/lib/utils/cn";

function CaseRow({ c }: { c: AlgCase }) {
  const key = myAlgKey(c.group, c.name);
  const choose = useMyAlgsStore((s) => s.choose);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);

  const applyAlg = (alg: string) => {
    if (!solvesCase(c.group, c.alg, alg)) {
      setBad(true);
      return;
    }
    setBad(false);
    choose(key, alg.trim());
    setTyped("");
  };

  return (
    <div className="card flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <CaseIcon setupAlg={invertAlg(c.alg)} kind={c.group} className="h-12 w-12 shrink-0 overflow-hidden rounded" />
        <p className="text-sm font-bold text-foreground">{c.name}</p>
      </div>
      <YourAlgs algCase={c} />
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
  const chosen = useMyAlgsStore((s) => s.chosen);
  const seenAll = useMyAlgsStore((s) => s.seen);
  const learnedThrough = useMyAlgsStore((s) => s.learnedThrough);
  const allSolves = useSessionStore((s) => s.allSolves);
  const reading = useMemo(() => analyzableSolves(allSolves).filter((x) => x.date > learnedThrough).length, [allSolves, learnedThrough]);
  const hasYours = (c: AlgCase) => (seenAll[myAlgKey(c.group, c.name)] ?? []).some((x) => !x.book);
  const detected = Object.fromEntries(Object.entries(seenAll).filter(([, v]) => v.length));
  const [group, setGroup] = useState<AlgGroup>("PLL");
  const [onlyMine, setOnlyMine] = useState(false);
  const cases = group === "PLL" ? PLL_CASES : OLL_CASES;
  // Cases with an algorithm of yours first, then everything you've been seen doing, then the rest.
  const seen = [...cases.filter(hasYours), ...cases.filter((c) => !hasYours(c) && detected[myAlgKey(c.group, c.name)])];
  const shown = onlyMine ? cases.filter((c) => chosen[myAlgKey(c.group, c.name)] || hasYours(c)) : [...seen, ...cases.filter((c) => !seen.includes(c))];
  const yoursCount = cases.filter(hasYours).length;
  const mineCount = Object.keys(chosen).length;

  return (
    <AnalyticsShell icon={<BookMarked size={17} className="text-accent" />} title="My Algs" subtitle="Your algorithms, not the book's — learned from your one-look solves, used everywhere.">
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
          {seen.length
            ? `${seen.length} ${group} cases seen done in one look on your smart cube${yoursCount ? ` — ${yoursCount} with an algorithm of your own` : ""}.`
            : `No one-look ${group} algorithms read from your smart-cube solves yet.`}
          {reading > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-muted-2">
              <Loader2 size={10} className="animate-spin" /> reading {reading} solves
            </span>
          )}
        </p>
        {shown.map((c) => (
          <CaseRow key={c.id} c={c} />
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
