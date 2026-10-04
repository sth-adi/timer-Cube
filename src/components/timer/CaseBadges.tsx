"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { effectiveAlg } from "@/lib/algorithms/myAlgs";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { peekWeakCases, solvesRevision, weakCasesFor, type WeakCases } from "@/components/timer/weakCases";
import { cn } from "@/lib/utils/cn";

/** Runs `fn` when the browser is idle (or soon after, where there is no idle callback), and returns how to cancel it. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 60);
  return () => window.clearTimeout(id);
}

/**
 * Which OLL/PLL cases are slow for you — read off all-time history, which means replaying every
 * saved solve, so it waits until a badge is about to name a case, runs when the browser is idle
 * (the badge paints first), and is remembered per history revision (see weakCases.ts).
 */
function useWeakCases(enabled: boolean): WeakCases | null {
  const allSolves = useSessionStore((s) => s.allSolves);
  const revision = useMemo(() => solvesRevision(allSolves), [allSolves]);
  const ready = enabled ? peekWeakCases(revision) : null;
  const [, setReadyTick] = useState(0);
  useEffect(() => {
    if (!enabled || ready) return undefined;
    return whenIdle(() => {
      weakCasesFor(allSolves, revision);
      setReadyTick((t) => t + 1);
    });
  }, [enabled, ready, allSolves, revision]);
  return ready;
}

function CaseRow({ group, name, weak, chosen }: { group: "OLL" | "PLL"; name: string | null; weak: boolean; chosen: Readonly<Record<string, string>> }): ReactNode {
  // Your main algorithm for the case (learned or picked), else the book's.
  const found = name ? findCase(group, name) : undefined;
  const alg = name && found ? effectiveAlg(chosen, group, name, found.alg) : undefined;
  return (
    <div
      // Always in the layout (a fixed-height row), so a case appearing never moves anything; only its opacity changes.
      className={cn(
        "flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-lg px-2 text-[11px] font-medium transition-opacity duration-300 motion-reduce:transition-none",
        name ? "bg-accent-soft text-accent opacity-100" : "opacity-0",
      )}
      aria-hidden={name ? undefined : true}
      data-testid={`case-badge-${group.toLowerCase()}`}
    >
      {name && (
        <>
          {found && <CaseIcon setupAlg={invertAlg(found.alg)} kind={group} className="h-6 w-6 shrink-0 overflow-hidden rounded-[3px]" />}
          <span className="flex shrink-0 items-center gap-1">
            <Sparkles size={11} aria-hidden />
            {group}: {name}
            {weak && <TriangleAlert size={11} role="img" className="text-warning" aria-label={`One of your slower ${group} cases — take your time recognizing it`} />}
          </span>
          {alg && (
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-normal text-muted" title={alg}>
              {alg}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The OLL and PLL cases this solve landed on, in a two-row slot that exists from the first move
 * (so the case appearing mid-solve doesn't push anything down) and fades in. A badge also flags a
 * case that runs slow for you; that needs your whole history, so it is only worked out once a case
 * is actually named.
 */
export const CaseBadges = memo(function CaseBadges({ ollCaseName, pllCaseName }: { ollCaseName: string | null; pllCaseName: string | null }) {
  const chosen = useMyAlgsStore((s) => s.chosen);
  const weak = useWeakCases(ollCaseName !== null || pllCaseName !== null);
  return (
    <div className="flex h-[3.75rem] w-full max-w-sm flex-col gap-1" data-testid="case-badges">
      <CaseRow group="OLL" name={ollCaseName} weak={ollCaseName !== null && !!weak?.oll.has(ollCaseName)} chosen={chosen} />
      <CaseRow group="PLL" name={pllCaseName} weak={pllCaseName !== null && !!weak?.pll.has(pllCaseName)} chosen={chosen} />
    </div>
  );
});
