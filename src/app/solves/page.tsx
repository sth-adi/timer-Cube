"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timer as TimerIcon, Sparkles, Music } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { SolveList } from "@/components/sessions/SolveList";
import { eventTagsPresent, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { EVENT_TAGS, type EventTag } from "@/types";
import { cn } from "@/lib/utils/cn";

/**
 * The solve history's own page — split out of the timer shell's sidebar,
 * which used to hold every solve from every event tag in one tall scroller
 * regardless of which kind of solve you actually wanted to look at. Tabbed
 * by event the same way StatsPanel already splits its numbers, so "Solves"
 * and "Stats" stay filtered the same way as each other.
 */
export default function SolvesPage() {
  const rawSolves = useSessionStore((s) => s.solves);
  const [selected, setSelected] = useState<EventTag | null>(null);
  const presentTags = useMemo(() => eventTagsPresent(rawSolves), [rawSolves]);

  const solves = useMemo(
    () => (selected ? solvesForEvent(rawSolves, selected) : normalSolves(rawSolves)),
    [rawSolves, selected],
  );

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-3 pb-8">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-lg font-semibold text-foreground">Solves</h1>
            <div className="flex gap-1.5">
              <Link
                href="/rhythm"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <Music size={13} />
                Rhythm
              </Link>
              <Link
                href="/constellation"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <Sparkles size={13} />
                Constellation
              </Link>
            </div>
          </div>

          {presentTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-pressed={selected === null}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  selected === null ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Normal
              </button>
              {presentTags.map((tag) => {
                const meta = EVENT_TAGS.find((t) => t.id === tag)!;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelected(tag)}
                    aria-pressed={selected === tag}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      selected === tag ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="card rounded-xl p-3">
            <SolveList solves={solves} />
          </div>
        </div>
      </div>
    </>
  );
}
