"use client";

import { useState } from "react";
import { ChevronDown, Microscope } from "lucide-react";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { STALL_RATIO, profileVariant, type AlgExecution, type CaseProfile, type VariantProfile } from "@/lib/xray/algMicroscope";
import { median } from "@/lib/xray/common";
import { cn } from "@/lib/utils/cn";

const secs = (ms: number) => (ms / 1000).toFixed(2);

function CaseThumb({ step, name }: { step: "OLL" | "PLL"; name: string }) {
  const algCase = findCase(step, name);
  if (!algCase) return <span className="h-8 w-8 shrink-0 rounded bg-bg-panel-2" />;
  return <CaseIcon setupAlg={invertAlg(algCase.alg)} kind={step} className="h-8 w-8 shrink-0 overflow-hidden rounded-[3px]" />;
}

/**
 * An algorithm drawn as its turns, each tinted by how long it took to come
 * after the previous one — so a stall shows up as a hot spot in the middle
 * of an otherwise even strip.
 */
export function TimingStrip({ tokens, gaps, stallIndex }: { tokens: readonly string[]; gaps: readonly number[]; stallIndex?: number | null }) {
  const typical = median(gaps.slice(1)) ?? 1;
  return (
    <div className="flex flex-wrap gap-[3px]">
      {tokens.map((t, i) => {
        const ratio = i === 0 ? 0 : gaps[i] / Math.max(1, typical);
        const heat = Math.max(0, Math.min(1, (ratio - 0.8) / (STALL_RATIO + 0.6 - 0.8)));
        const isStall = i === stallIndex;
        return (
          <span
            key={i}
            title={i === 0 ? "first turn" : `${Math.round(gaps[i])} ms after the previous turn`}
            className={cn(
              "flex min-w-[26px] flex-col items-center rounded-[4px] px-1 py-0.5 font-mono text-[11px] font-semibold",
              isStall ? "ring-2 ring-danger" : "",
            )}
            style={{
              background: `color-mix(in oklab, var(--danger) ${Math.round(heat * 70)}%, var(--bg-panel-2))`,
              color: "var(--foreground)",
            }}
          >
            {t}
            <span className="text-[8px] font-normal tabular-nums text-muted-2">{i === 0 ? "·" : Math.round(gaps[i])}</span>
          </span>
        );
      })}
    </div>
  );
}

function VariantBlock({ v, bestMean }: { v: VariantProfile; bestMean: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-bg-panel-2/60 p-2">
      <div className="flex items-center justify-between text-[10px] text-muted-2">
        <span>
          used {v.count}× · mean {secs(v.meanExecMs)}s · best {secs(v.bestExecMs)}s
        </span>
        {v.meanExecMs <= bestMean && <span className="font-semibold text-success">your fastest</span>}
      </div>
      <TimingStrip tokens={v.tokens} gaps={v.meanGaps} stallIndex={v.stall?.index} />
      {v.stall && (
        <p className="text-[10px] text-danger">
          Stall on turn {v.stall.index + 1} ({v.stall.token}): {Math.round(v.stall.ms)} ms — {v.stall.ratio.toFixed(1)}× your pace
          through the rest of it.
        </p>
      )}
    </div>
  );
}

function CaseRow({ c }: { c: CaseProfile }) {
  const [open, setOpen] = useState(false);
  const bestMean = Math.min(...c.variants.map((v) => v.meanExecMs));
  const stalls = c.variants.filter((v) => v.stall).length;
  return (
    <li className="rounded-lg bg-bg-panel-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
        <CaseThumb step={c.step} name={c.caseName} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold text-foreground">
            {c.step} · {c.caseName}
          </span>
          <span className="text-[10px] text-muted-2">
            {c.count}× · {c.variants.length} alg{c.variants.length === 1 ? "" : "s"}
            {stalls > 0 && <span className="text-danger"> · stall found</span>}
          </span>
        </div>
        <div className="flex flex-col items-end text-[10px] tabular-nums">
          <span className="text-muted">
            <span className="text-muted-2">see</span> {secs(c.meanRecognitionMs)}s
          </span>
          <span className="text-foreground">
            <span className="text-muted-2">do</span> {secs(c.meanExecMs)}s
          </span>
        </div>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-2 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-2.5 pb-2.5">
          {c.variants.map((v) => (
            <VariantBlock key={v.alg} v={v} bestMean={bestMean} />
          ))}
        </div>
      )}
    </li>
  );
}

/** History view: every case you've met, slowest first, each expandable into the algorithm(s) you use and their turn-by-turn timing. */
export function AlgMicroscopePanel({ cases }: { cases: CaseProfile[] }) {
  if (cases.length === 0) {
    return <p className="py-3 text-center text-xs text-muted">No OLL/PLL executions recorded yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {cases.map((c) => (
        <CaseRow key={`${c.step}:${c.caseName}`} c={c} />
      ))}
    </ul>
  );
}

/** One solve's last layer under the microscope: each algorithm you did, turn by turn. */
export function SolveAlgMicroscope({ executions }: { executions: AlgExecution[] }) {
  if (executions.length === 0) {
    return <p className="text-[11px] text-muted">No full OLL/PLL algorithm in this solve (a skip, or a multi-look last layer).</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Microscope size={13} className="text-accent" /> Alg Microscope
      </p>
      {executions.map((e) => {
        const v = profileVariant([e]);
        return (
          <div key={e.step} className="flex flex-col gap-1.5 rounded-lg bg-bg-panel-2 p-2.5">
            <div className="flex items-center gap-2.5">
              <CaseThumb step={e.step} name={e.caseName} />
              <div className="flex flex-1 flex-col">
                <span className="text-[11px] font-semibold text-foreground">
                  {e.step} · {e.caseName}
                </span>
                <span className="text-[10px] tabular-nums text-muted-2">
                  recognized in {secs(e.recognitionMs)}s · executed in {secs(e.executionMs)}s
                </span>
              </div>
            </div>
            <TimingStrip tokens={e.tokens} gaps={e.gaps} stallIndex={v.stall?.index} />
            {v.stall && (
              <p className="text-[10px] text-danger">
                Hesitated before {v.stall.token} (turn {v.stall.index + 1}): {Math.round(v.stall.ms)} ms, {v.stall.ratio.toFixed(1)}× the rest.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
