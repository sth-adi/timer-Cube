"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, ScanLine } from "lucide-react";
import { runXray } from "@/lib/xray/client";
import type { SolveXray } from "@/lib/xray/solveXray";
import { CROSS_COLORS, CROSS_COLOR_NAME } from "@/lib/xray/neutrality";
import { PAIR_LABELS } from "@/lib/xray/common";
import { outcomeLabel } from "./LastSlotOracleCard";

interface XrayTeaserProps {
  scramble: string;
  moves: string[];
  timesMs: number[];
}

/** The single most interesting line each X-Ray analysis has about a solve, or null when it has nothing to say. */
function highlights(x: SolveXray): string[] {
  const out: string[] = [];
  if (x.oracle?.better) {
    out.push(`Last slot: ${x.oracle.better.display} would have given ${outcomeLabel(x.oracle.better.outcome)}`);
  } else if (x.oracle?.skipAvailable) {
    out.push("Last slot: an OLL skip was one insertion away");
  }
  const regret = x.flow?.decisions.find((d) => d.regret > 0);
  if (regret) out.push(`F2L: ${PAIR_LABELS[regret.easiestPair]} was ${regret.easiestDistance} away when you went for a ${regret.chosenDistance}-turn pair`);
  const stall = x.executions
    .map((e) => {
      const typical = [...e.gaps.slice(1)].sort((a, b) => a - b)[Math.floor((e.gaps.length - 1) / 2)] ?? 0;
      const k = e.gaps.indexOf(Math.max(...e.gaps));
      return typical > 0 && e.gaps[k] / typical >= 1.7 ? `${e.caseName}: hesitated before ${e.tokens[k]} (turn ${k + 1})` : null;
    })
    .find(Boolean);
  if (stall) out.push(stall);
  if (x.neutrality) {
    const best = Math.min(...CROSS_COLORS.map((c) => x.neutrality!.lengths[c]));
    if (best < x.neutrality.lengths.U) {
      const color = CROSS_COLORS.find((c) => x.neutrality!.lengths[c] === best)!;
      out.push(`Cross: ${CROSS_COLOR_NAME[color]} had a ${best}-turn cross (white: ${x.neutrality.lengths.U})`);
    }
  }
  return out;
}

/** A post-solve peek at the X-Ray — runs in its worker, so the recap never waits on it. */
export function XrayTeaser({ scramble, moves, timesMs }: XrayTeaserProps) {
  const [result, setResult] = useState<{ key: string; x: SolveXray | null } | null>(null);
  const key = `${scramble}|${moves.length}`;
  useEffect(() => {
    let cancelled = false;
    runXray({ scramble, moves, timesMs })
      .then((x) => !cancelled && setResult({ key, x }))
      .catch(() => !cancelled && setResult({ key, x: null }));
    return () => {
      cancelled = true;
    };
  }, [key, scramble, moves, timesMs]);
  const x = result?.key === key ? result.x : undefined;
  const lines = x ? highlights(x) : [];

  return (
    <Link href="/xray" className="card flex w-full flex-col gap-2 rounded-xl p-3 transition-colors hover:bg-bg-panel-2/40">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ScanLine size={13} className="text-accent" /> Solve X-Ray
        </p>
        <span className="flex items-center text-[11px] text-accent">
          Open <ChevronRight size={13} />
        </span>
      </div>
      {x === undefined ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-2">
          <Loader2 size={11} className="animate-spin" /> Replaying every turn…
        </p>
      ) : lines.length === 0 ? (
        <p className="text-[11px] text-muted">Pair choice, last slot, algorithms and cross all check out on this one.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((l) => (
            <li key={l} className="text-[11px] text-muted">
              • {l}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
