"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, ScrollText, TriangleAlert } from "lucide-react";
import type { Reconstruction } from "@/lib/analysis/reconText";
import type { Mistake } from "@/lib/analysis/mistakeRadar";
import { cn } from "@/lib/utils/cn";

/**
 * The solve written out step by step in your own grip — cross, each pair,
 * OLL and PLL with its case, time and turn count — ready to copy or open
 * in Twizzle (the scramble set up, the solve playing on a 3D cube). Steps
 * the Mistake Radar flagged carry a small marker, so the written record and
 * the radar agree on where the time actually went instead of living as two
 * separate readings of the same solve.
 */
export function ReconstructionCard({ recon, stepMistakes }: { recon: Reconstruction; stepMistakes?: Map<number, Mistake[]> | null }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const copyText = async () => {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(recon.text);
    } catch {
      // Clipboard blocked: say so — the steps are on screen to select by hand.
      next = "failed";
    }
    setCopy(next);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopy("idle"), next === "copied" ? 1500 : 4000);
  };
  const copied = copy === "copied";
  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
          <ScrollText size={11} className="text-accent" /> Reconstruction
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void copyText()} className="flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-foreground hover:text-accent">
            {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />} {copied ? "Copied" : copy === "failed" ? "Couldn't copy" : "Copy"}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? "Copied" : copy === "failed" ? "Couldn't copy, the text is selectable" : ""}
          </span>
          <a href={recon.twizzleUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-foreground hover:text-accent">
            <ExternalLink size={11} /> Twizzle
          </a>
        </div>
      </div>
      <p className="mb-1.5 text-[11px] text-muted">
        {recon.rotation ? <span className="font-mono text-foreground">{recon.rotation}</span> : "No rotation"} — held {recon.gripLabel}
        {copy === "failed" && <span className="text-warning"> · Couldn&apos;t copy, the text is selectable</span>}
      </p>
      <div className="flex flex-col gap-1">
        {recon.steps.map((s, k) => {
          const hits = stepMistakes?.get(k);
          return (
            <div key={s.label}>
              <div className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-2 text-[11px]">
                <span className="flex items-center gap-1 truncate font-semibold text-foreground" title={s.caseName ?? undefined}>
                  {s.label}
                  {hits && hits.length > 0 && (
                    <TriangleAlert size={10} aria-hidden="true" className="shrink-0 text-warning">
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
              {hits && hits.length > 0 && <StepMistakes hits={hits} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What the Mistake Radar flagged in one step, written out under it: the first
 * reason always shows (a hover tooltip is no use on a phone), and a tap on it
 * opens every flagged mistake with its detail. The collapsed line is a single
 * line either way, so the rows below don't move until you ask.
 */
function StepMistakes({ hits }: { hits: Mistake[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const more = hits.length - 1;
  return (
    <div className="ml-[5rem] mt-0.5 text-[10px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        title={hits.map((m) => m.title).join("; ")}
        className="flex max-w-full items-center gap-0.5 rounded text-left text-warning focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <ChevronRight size={10} aria-hidden="true" className={cn("shrink-0 transition-transform", open && "rotate-90")} />
        <span className="min-w-0 truncate">{hits[0].title}</span>
        {more > 0 && <span className="shrink-0 text-muted-2">+{more} more</span>}
      </button>
      <ul id={listId} hidden={!open} className={cn("mt-0.5 flex-col gap-0.5 pl-3 text-muted", open ? "flex" : "hidden")}>
        {hits.map((m, i) => (
          <li key={i}>
            <span className="font-medium text-foreground">{m.title}</span> — {m.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
