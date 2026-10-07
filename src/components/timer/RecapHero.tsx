"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import "@/styles/moments.css";

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
 * The finish, on the big digits above: they settle and one band of light crosses them (the
 * `moment-stop` class in styles/moments.css). The digits belong to the timer stage, not to this
 * component, so this reaches them for as long as the recap is up and hands them back after; the
 * sweep draws the digits again from `data-text`, so a time that changes under it (the saved
 * result landing) is mirrored. DOM only: no state, no re-render.
 */
function useFinishMoment(finalMs: number | null, priorBestMs: number | null): void {
  const gold = finalMs !== null && priorBestMs !== null && finalMs < priorBestMs;
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".timer-stage .timer-digits");
    if (!el) return undefined;
    const mirror = () => {
      el.dataset.text = el.textContent ?? "";
    };
    mirror();
    el.classList.add("moment-stop");
    const watch = new MutationObserver(mirror);
    watch.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      watch.disconnect();
      el.classList.remove("moment-stop");
      delete el.dataset.text;
      delete el.dataset.gold;
    };
  }, []);
  // A new session best tints the sweep gold (a separate effect: it must not replay the settle).
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".timer-stage .timer-digits");
    if (!el) return undefined;
    if (gold) el.dataset.gold = "true";
    return () => {
      delete el.dataset.gold;
    };
  }, [gold]);
}

/**
 * The top of the recap, under the big time: how it compared with your session best, then the
 * ribbon and the four split chips (passed in, so this stays layout only). Fixed text height, so a
 * delta that changes when the saved solve lands doesn't move anything. It fades up under the
 * digits; a new session best gets a gold capsule with one glint, and gold splits in the children
 * (marked data-gold) get theirs, all from styles/moments.css.
 */
export function RecapHero({ finalMs, priorBestMs, children }: { finalMs: number | null; priorBestMs: number | null; children: ReactNode }) {
  const delta = bestDelta(finalMs, priorBestMs);
  const fresh = finalMs !== null && priorBestMs !== null && finalMs < priorBestMs;
  const tone = fresh ? "best" : delta.tone === "best" ? "equal" : delta.tone;
  useFinishMoment(finalMs, priorBestMs);
  return (
    <section className="recap-hero flex w-full flex-col items-center gap-2.5" aria-label="Solve result" data-testid="recap-hero">
      <p className={cn("recap-delta", fresh && "moment-glint")} data-tone={tone} data-testid="recap-delta" aria-live="polite">
        {delta.text}
      </p>
      {children}
    </section>
  );
}
