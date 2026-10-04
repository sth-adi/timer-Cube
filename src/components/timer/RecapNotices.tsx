"use client";

import { useId, useState } from "react";
import { ChevronDown, Sparkles, TriangleAlert } from "lucide-react";
import { LearnedAlgNotice } from "@/components/algorithms/LearnedAlgNotice";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import type { SolveRecap } from "@/lib/store/recapStore";
import { cn } from "@/lib/utils/cn";

type Open = "turns" | "learned" | null;

function Chip({ open, onToggle, controls, tone, icon, children }: { open: boolean; onToggle: () => void; controls: string; tone: "warning" | "accent"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        // A small chip with a 44px-tall touch area (see .hit-y).
        "hit-y flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        tone === "warning" ? "bg-warning/10 text-warning" : "bg-accent-soft text-accent",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
      <ChevronDown size={12} className={cn("shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
    </button>
  );
}

/**
 * The two notices a recap can carry — a lost-and-repaired turn, and a newly learned algorithm —
 * folded to one line each; tap a chip to read the whole thing. Nothing is dropped, it just stops
 * pushing the table off the screen.
 */
export function RecapNotices({ turnLoss, learnedSolveDate }: { turnLoss: SolveRecap["turnLoss"] | undefined; learnedSolveDate: number | null }) {
  const [open, setOpen] = useState<Open>(null);
  const id = useId();
  const recent = useMyAlgsStore((s) => s.recent);
  const learnedCount = learnedSolveDate === null ? 0 : recent.filter((r) => r.at === learnedSolveDate).length;
  if (!turnLoss && learnedCount === 0) return null;
  const toggle = (which: Exclude<Open, null>) => setOpen((cur) => (cur === which ? null : which));
  const repaired = turnLoss?.kind === "repaired" ? turnLoss : null;
  return (
    <div className="flex w-full flex-col items-center gap-1.5" data-testid="recap-notices">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        {turnLoss && (
          <Chip open={open === "turns"} onToggle={() => toggle("turns")} controls={`${id}-turns`} tone="warning" icon={<TriangleAlert size={12} className="shrink-0" aria-hidden />}>
            {repaired ? "Turn put back — recap rebuilt" : "Turns lost — no move-by-move recap"}
          </Chip>
        )}
        {learnedCount > 0 && (
          <Chip open={open === "learned"} onToggle={() => toggle("learned")} controls={`${id}-learned`} tone="accent" icon={<Sparkles size={12} className="shrink-0" aria-hidden />}>
            {learnedCount > 1 ? `${learnedCount} new algorithms learned` : "New algorithm learned"}
          </Chip>
        )}
      </div>
      {turnLoss && (
        // Kept in the page (just not shown) so the full text and its test ids are always there.
        <p
          id={`${id}-turns`}
          hidden={open !== "turns"}
          className="flex w-full items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-[11px] leading-snug text-warning"
          data-testid={repaired ? "turn-repair-notice" : "turn-loss-notice"}
        >
          <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {repaired
              ? repaired.change.kind === "inserted"
                ? `The cube never reported ${repaired.change.tokens.join(" ")} — it's put back where the cube's state says it happened, so this recap is rebuilt, not recorded.`
                : `The cube reported ${repaired.change.tokens.join(" ")} twice — the echo is removed, so this recap is rebuilt, not recorded.`
              : "Turns went missing over Bluetooth in more than one place, so they couldn't be put back — the time is saved, the move-by-move recap isn't."}
          </span>
        </p>
      )}
      {learnedCount > 0 && open === "learned" && (
        <div id={`${id}-learned`} className="w-full">
          <LearnedAlgNotice solveDate={learnedSolveDate} />
        </div>
      )}
    </div>
  );
}
