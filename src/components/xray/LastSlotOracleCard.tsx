"use client";

import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { InsertionOption, LastLayerOutcome, OracleReport } from "@/lib/xray/lastSlotOracle";
import { PairChip } from "./F2lFlowChart";
import { cn } from "@/lib/utils/cn";

/** How many alternative outcomes to list. */
const MAX_SHOWN = 6;

export function outcomeLabel(o: LastLayerOutcome): string {
  if (o.kind === "ll-skip") return "LL skip";
  if (o.kind === "oll-skip") return "OLL skip";
  const name = o.ollName ?? "Unknown OLL";
  return o.kind === "edges-oriented" ? `${name} · edges oriented` : name;
}

function OutcomeIcon({ outcome }: { outcome: LastLayerOutcome }) {
  const algCase = outcome.ollName ? findCase("OLL", outcome.ollName) : undefined;
  if (outcome.kind === "ll-skip" || outcome.kind === "oll-skip" || !algCase) {
    return (
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
          outcome.kind === "ll-skip" || outcome.kind === "oll-skip" ? "bg-[#ffd42a] text-black" : "bg-bg-panel-2 text-muted-2",
        )}
      >
        {outcome.kind === "ll-skip" ? "LL" : outcome.kind === "oll-skip" ? "SKIP" : "?"}
      </span>
    );
  }
  return <CaseIcon setupAlg={invertAlg(algCase.alg)} kind="OLL" className="h-9 w-9 shrink-0 overflow-hidden rounded-[3px]" />;
}

function OptionRow({ option, highlight, tag }: { option: InsertionOption; highlight?: boolean; tag?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 py-2.5 first:pt-0", highlight && "-mx-2 rounded-lg bg-accent-soft px-2")}>
      <OutcomeIcon outcome={option.outcome} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          {outcomeLabel(option.outcome)}
          {tag && <span className="text-[11px] font-medium text-muted-2">({tag})</span>}
        </p>
        <p className="break-words font-mono text-[11px] text-muted">{option.display}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-xs font-bold tabular-nums text-foreground">{option.cost}</span>
        <span className="text-[11px] text-muted-2">turns to OLL done</span>
      </div>
    </div>
  );
}

/**
 * Last Slot Oracle: what your last F2L pair's insertion did to the last
 * layer, next to every other short <R, U, F> insertion from the same spot
 * and what each of those would have left you with.
 */
export function LastSlotOracleCard({ report }: { report: OracleReport }) {
  // One row per distinct OLL outcome (options arrive best-first, so the
  // first of each is its cheapest insertion); your own outcome only reappears
  // if some other insertion reached it more cheaply.
  const yourKey = outcomeLabel(report.yours.outcome);
  const seen = new Set<string>();
  const shown = report.options
    .filter((o) => {
      const key = outcomeLabel(o.outcome);
      if (seen.has(key) || (key === yourKey && o.cost >= report.yours.cost)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SHOWN);
  const betterKey = report.better?.moves.join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Last slot oracle</h3>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <PairChip pair={report.lastPair} /> {report.lastPairLabel} last
        </span>
      </div>

      {report.better ? (
        <p className="text-sm text-success">
          <span>
            <span className="font-mono font-semibold">{report.better.display}</span> would have left{" "}
            <span className="font-semibold">{outcomeLabel(report.better.outcome)}</span>, {report.yours.cost - report.better.cost} turns
            fewer to finish OLL than what you did.
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted">Your insertion was already the cheapest way through OLL from here.</p>
      )}

      <OptionRow option={report.yours} tag="yours" />
      {shown.length > 0 && <p className="pt-1 text-xs font-medium text-muted-2">Other insertions from the same spot</p>}
      <div className="flex flex-col divide-y divide-border">
        {shown.map((o) => (
          <OptionRow key={o.moves.join(" ")} option={o} highlight={o.moves.join(" ") === betterKey} />
        ))}
      </div>
      <p className="text-[11px] text-muted-2">
        Yellow on top, this slot at front-right. Searched every insertion up to {report.searchedDepth} turns
        {report.partial ? " (search cut short)" : ""}.
      </p>
    </div>
  );
}
