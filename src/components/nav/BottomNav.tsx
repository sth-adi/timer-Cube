"use client";

import { Timer as TimerIcon, BarChart3, ListOrdered, Repeat, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "timer", label: "Timer", icon: TimerIcon },
  { id: "trainer", label: "Trainer", icon: Repeat },
  { id: "analyze", label: "Analyze", icon: Wand2 },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "solves", label: "Solves", icon: ListOrdered },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/**
 * Mobile-only tab bar so the Timer screen can be full and uncluttered
 * instead of one long scroll past stats/history on every visit. Hidden at
 * the lg breakpoint, where there's room to show everything at once.
 */
export function BottomNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-bg-elevated lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)", height: "calc(var(--nav-height) + var(--safe-bottom))" }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={isActive}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
              isActive ? "text-accent" : "text-muted-2",
            )}
          >
            <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
