"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { SessionSwitcher } from "@/components/sessions/SessionSwitcher";
import { SolveList } from "@/components/sessions/SolveList";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { InsightsPanel } from "@/components/stats/InsightsPanel";
import { ScrambleBar } from "@/components/scramble/ScrambleBar";
import { HintPanel } from "@/components/scramble/HintPanel";
import { TimerView } from "@/components/timer/TimerView";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PBToast } from "@/components/timer/PBToast";
import { AchievementToast } from "@/components/timer/AchievementToast";
import { BottomNav, type TabId } from "@/components/nav/BottomNav";
import { cn } from "@/lib/utils/cn";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("timer");

  return (
    <>
      <AppBootstrap />
      <PBToast />
      <AchievementToast />
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-3 py-2">
          <SessionSwitcher />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="tap-target rounded-lg text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
          >
            <Settings size={19} />
          </button>
        </header>

        <div className={cn(tab === "timer" ? "block" : "hidden", "lg:block")}>
          <ScrambleBar className="mt-1" />
        </div>

        <main className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 px-4 pb-[calc(var(--nav-height)+var(--safe-bottom)+1rem)] lg:pb-4">
          <div
            className={cn(
              "flex-col items-center justify-center gap-4",
              tab === "timer" ? "flex" : "hidden",
              "lg:flex",
            )}
          >
            <TimerView />
            <HintPanel />
          </div>

          <aside
            className={cn(
              "flex-col gap-4 pb-2",
              tab !== "timer" ? "flex" : "hidden",
              "lg:flex lg:overflow-y-auto",
            )}
          >
            <div className={cn("flex-col gap-3", tab === "stats" ? "flex" : "hidden", "lg:flex")}>
              <StatsPanel />
              <InsightsPanel />
            </div>
            <div className={cn("flex-col lg:flex-1", tab === "solves" ? "flex" : "hidden", "lg:flex")}>
              <div className="card rounded-xl p-3 lg:flex-1">
                <SolveList />
              </div>
            </div>
          </aside>
        </main>
      </div>

      <BottomNav active={tab} onChange={setTab} />

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
