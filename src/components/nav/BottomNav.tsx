"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Timer as TimerIcon, BarChart3, Gamepad2, ListOrdered, Repeat, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "timer", label: "Timer", icon: TimerIcon },
  { id: "trainer", label: "Trainer", icon: Repeat },
  { id: "analyze", label: "Analyze", icon: Wand2 },
  { id: "stats", label: "Stats", icon: BarChart3 },
] as const;

export type TabId = (typeof TABS)[number]["id"] | "solves";

/** Six equal slots: four in-shell tabs, then the Play and Solves routes. The active pill (globals.css) is sized from this. */
const SLOTS = 6;

const ITEM =
  "fx-dock-item flex min-w-0 flex-1 flex-col items-center justify-center gap-[5px] text-[11px] font-medium leading-none tracking-[0.01em] transition-colors";

function Label({ children }: { children: ReactNode }) {
  return <span className="max-w-full truncate">{children}</span>;
}

/**
 * Mobile-only tab bar so the Timer screen can be full and uncluttered
 * instead of one long scroll past stats/history on every visit. Hidden at
 * the lg breakpoint, where there's room to show everything at once.
 *
 * "Solves" is a real route (/solves), not one of these in-shell tabs — it
 * got its own full page instead of living in the stats aside's scroller, so
 * it navigates away rather than flipping local tab state. "Play" (the cube
 * games) is its own route the same way.
 *
 * The look (floating glass pill with a sliding active pill, or a flat bar with a top tick when
 * effects are off), the 44px targets, the press feedback and the safe-area padding all live in
 * globals.css under `.fx-dock`; the active pill moves with a transform driven by `--i` / `--on`.
 */
export function BottomNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const activeIndex = TABS.findIndex((t) => t.id === active);
  return (
    <nav aria-label="Main" className="fx-dock fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-bg-elevated px-1 lg:hidden">
      <span
        className="fx-dock-glow"
        aria-hidden="true"
        style={{ "--i": Math.max(0, activeIndex), "--on": activeIndex >= 0 ? 1 : 0, "--slots": SLOTS } as CSSProperties}
      />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive}
            className={cn(ITEM, isActive ? "text-accent" : "text-muted-2")}
          >
            <Icon size={21} strokeWidth={isActive ? 2.25 : 2} aria-hidden="true" />
            <Label>{tab.label}</Label>
          </button>
        );
      })}
      <Link href="/play" data-active={false} className={cn(ITEM, "text-muted-2")}>
        <Gamepad2 size={21} strokeWidth={2} aria-hidden="true" />
        <Label>Play</Label>
      </Link>
      <Link href="/solves" data-active={false} className={cn(ITEM, "text-muted-2")}>
        <ListOrdered size={21} strokeWidth={2} aria-hidden="true" />
        <Label>Solves</Label>
      </Link>
    </nav>
  );
}
