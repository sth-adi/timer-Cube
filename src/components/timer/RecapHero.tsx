"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** What this solve did to your session best, in words: the sign and the arrow carry it, not just the colour. */
export function bestDelta(finalMs: number | null, priorBestMs: number | null): { text: string; tone: "best" | "off" | "neutral" } {
  if (finalMs === null) return { text: "DNF — no time counted", tone: "neutral" };
  if (priorBestMs === null) return { text: "First time on the board this session", tone: "neutral" };
  const diff = finalMs - priorBestMs;
  if (diff < 0) return { text: `▼ New session best · −${(Math.abs(diff) / 1000).toFixed(2)}s`, tone: "best" };
  if (diff === 0) return { text: "Equals your session best", tone: "best" };
  return { text: `▲ +${(diff / 1000).toFixed(2)}s vs session best`, tone: "off" };
}

/**
 * The top of the recap, under the big time: how it compared with your session best, then the
 * ribbon and the four split chips (passed in, so this stays layout only). Fixed text height, so a
 * delta that changes when the saved solve lands doesn't move anything.
 */
export function RecapHero({ finalMs, priorBestMs, children }: { finalMs: number | null; priorBestMs: number | null; children: ReactNode }) {
  const delta = bestDelta(finalMs, priorBestMs);
  return (
    <section className="flex w-full flex-col items-center gap-2.5" aria-label="Solve result" data-testid="recap-hero">
      <p
        className={cn("min-h-5 text-center text-[13px] font-semibold tabular-nums", delta.tone === "best" ? "text-success" : delta.tone === "off" ? "text-muted" : "text-muted")}
        data-testid="recap-delta"
        aria-live="polite"
      >
        {delta.text}
      </p>
      {children}
    </section>
  );
}
