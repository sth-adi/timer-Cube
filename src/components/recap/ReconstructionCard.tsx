"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, ScrollText, TriangleAlert } from "lucide-react";
import type { Reconstruction } from "@/lib/analysis/reconText";
import type { Mistake } from "@/lib/analysis/mistakeRadar";

/**
 * The solve written out step by step in your own grip — cross, each pair,
 * OLL and PLL with its case, time and turn count — ready to copy or open
 * in Twizzle (the scramble set up, the solve playing on a 3D cube). Steps
 * the Mistake Radar flagged carry a small marker, so the written record and
 * the radar agree on where the time actually went instead of living as two
 * separate readings of the same solve.
 */
export function ReconstructionCard({ recon, stepMistakes }: { recon: Reconstruction; stepMistakes?: Map<number, Mistake[]> | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recon.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  };
  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
          <ScrollText size={11} className="text-accent" /> Reconstruction
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-foreground hover:text-accent">
            {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
          </button>
          <a href={recon.twizzleUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-foreground hover:text-accent">
            <ExternalLink size={11} /> Twizzle
          </a>
        </div>
      </div>
      <p className="mb-1.5 text-[11px] text-muted">
        {recon.rotation ? <span className="font-mono text-foreground">{recon.rotation}</span> : "No rotation"} — held {recon.gripLabel}
      </p>
      <div className="flex flex-col gap-1">
        {recon.steps.map((s, k) => {
          const hits = stepMistakes?.get(k);
          return (
          <div key={s.label} className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-2 text-[11px]">
            <span className="flex items-center gap-1 truncate font-semibold text-foreground" title={s.caseName ?? undefined}>
              {s.label}
              {hits && hits.length > 0 && (
                <TriangleAlert size={10} className="shrink-0 text-warning">
                  <title>{hits.map((m) => m.title).join("; ")}</title>
                </TriangleAlert>
              )}
            </span>
            <span className="min-w-0 break-words font-mono text-muted">
              {s.moves.join(" ") || (k > 0 ? <span className="font-sans italic text-muted-2">came in with {recon.steps[k - 1].label}</span> : "—")}
              {s.caseName && <span className="ml-1.5 font-sans text-[10px] text-muted-2">{s.caseName}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-2">
              {(s.ms / 1000).toFixed(2)} · {s.moves.length}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}
