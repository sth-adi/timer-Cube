"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, ScrollText, TriangleAlert } from "lucide-react";
import type { Reconstruction } from "@/lib/analysis/reconText";
import type { Mistake } from "@/lib/analysis/mistakeRadar";
import { Collapse, RecapCard, CardTitle, secs2 } from "./RecapParts";

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
    <RecapCard>
      <div className="flex items-center justify-between gap-2">
        <CardTitle icon={<ScrollText size={12} aria-hidden="true" />}>Reconstruction</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => void copyText()} className="rc-pill-btn hit-y">
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? "Copied" : copy === "failed" ? "Couldn't copy" : "Copy"}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? "Copied" : copy === "failed" ? "Couldn't copy, the text is selectable" : ""}
          </span>
          <a href={recon.twizzleUrl} target="_blank" rel="noreferrer" className="rc-pill-btn hit-y">
            <ExternalLink size={12} aria-hidden="true" /> Twizzle
          </a>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-4 text-muted">
        {recon.rotation ? <span className="font-mono text-foreground">{recon.rotation}</span> : "No rotation"} — held {recon.gripLabel}
        {copy === "failed" && <span className="rc-t-slow"> · Couldn&apos;t copy, the text is selectable</span>}
      </p>
      <div className="rc-steps mt-4">
        {recon.steps.map((s, k) => {
          const hits = stepMistakes?.get(k);
          const flagged = !!hits && hits.length > 0;
          const none = s.moves.length === 0;
          return (
            <div key={s.label}>
              <div className="rc-step-head">
                <span className="shrink-0 font-semibold text-foreground">{s.label}</span>
                {s.caseName && (
                  <span className="min-w-0 flex-1 truncate text-muted" title={s.caseName}>
                    {s.caseName}
                  </span>
                )}
                {flagged && (
                  <TriangleAlert size={12} aria-hidden="true" className="shrink-0 rc-t-slow">
                    <title>{hits.map((m) => m.title).join("; ")}</title>
                  </TriangleAlert>
                )}
                <span className="rc-num ml-auto shrink-0 text-muted">
                  {secs2(s.ms)} · {s.moves.length} {s.moves.length === 1 ? "turn" : "turns"}
                </span>
              </div>
              <p className="rc-step-moves" data-empty={none}>
                {none ? (k > 0 ? `came in with ${recon.steps[k - 1].label}` : "no turns") : s.moves.join(" ")}
              </p>
              {flagged && <StepMistakes hits={hits} />}
            </div>
          );
        })}
      </div>
    </RecapCard>
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
    <div className="mt-1 pl-[10px] text-[12px] leading-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        title={hits.map((m) => m.title).join("; ")}
        className="hit-y rc-t-slow flex min-h-6 max-w-full items-center gap-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <ChevronRight size={12} aria-hidden="true" className="rc-chev shrink-0" style={{ transform: open ? "rotate(90deg)" : undefined }} />
        <span className="min-w-0 truncate">{hits[0].title}</span>
        {more > 0 && <span className="shrink-0 text-muted-2">+{more} more</span>}
      </button>
      <Collapse open={open} id={listId}>
        <ul className="flex flex-col gap-1 pb-1 pl-4 pt-1 text-muted">
          {hits.map((m, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{m.title}</span> — {m.detail}
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
