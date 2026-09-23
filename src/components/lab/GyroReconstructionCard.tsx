"use client";

import { useState } from "react";
import { Check, Copy, RotateCw } from "lucide-react";
import { rotationsPerPhase, type SolveGyroSummary } from "@/lib/gyro/solveGyro";
import { cn } from "@/lib/utils/cn";

const ROTATION = /^[xyz]/;

interface GyroReconstructionCardProps {
  summary: SolveGyroSummary;
  /** Phase labels with their end time in ms from solve start (null = not reached) — the post-solve table's rows. */
  phases: { label: string; endMs: number | null }[];
}

/**
 * The gyro's contribution to a solve recap: the reconstruction as the solver
 * actually saw it (moves named from their own grip, regrips inserted where
 * they happened), and how many regrips each phase cost. A smart cube without
 * a gyro can only ever report "the red face turned"; this is the first time
 * the app knows that was an R *or* an L depending on how you were holding it.
 */
export function GyroReconstructionCard({ summary, phases }: GyroReconstructionCardProps) {
  const [copied, setCopied] = useState(false);
  const tokens = summary.orientedReconstruction.split(" ").filter(Boolean);
  const perPhase = rotationsPerPhase(
    summary.rotations,
    phases.map((p) => p.endMs),
  );
  const total = summary.rotations.length;
  const worst = perPhase.reduce((best, n, i) => (n > perPhase[best] ? i : best), 0);

  const copy = () => {
    void navigator.clipboard?.writeText(summary.orientedReconstruction).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="card flex w-full flex-col gap-2.5 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <RotateCw size={13} className="text-accent" /> Rotation-aware reconstruction
        </p>
        <button type="button" onClick={copy} className="flex items-center gap-1 text-[11px] text-muted-2 hover:text-foreground">
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] text-muted-2">Held {summary.startLabel} at the first move · {total === 0 ? "no regrips" : `${total} regrip${total === 1 ? "" : "s"}`}</p>

      <div className="flex flex-wrap gap-1">
        {phases.map((p, i) => (
          <span
            key={p.label}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
              perPhase[i] === 0
                ? "bg-bg-panel-2 text-muted-2"
                : i === worst && perPhase[i] > 1
                  ? "bg-warning/15 text-warning"
                  : "bg-accent-soft text-accent",
            )}
          >
            {p.label} · {perPhase[i]}
          </span>
        ))}
      </div>

      <p className="font-mono text-xs leading-relaxed text-foreground">
        {tokens.map((t, i) => (
          <span key={i} className={cn("mr-1.5 inline-block", ROTATION.test(t) && "rounded bg-accent px-1 font-bold text-accent-fg")}>
            {t}
          </span>
        ))}
      </p>
    </div>
  );
}
