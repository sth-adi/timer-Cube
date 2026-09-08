"use client";

import { useState } from "react";
import { Settings, Timer as TimerIcon, Repeat } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { SessionSwitcher } from "@/components/sessions/SessionSwitcher";
import { SolveList } from "@/components/sessions/SolveList";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { InsightsPanel } from "@/components/stats/InsightsPanel";
import { ScrambleBar } from "@/components/scramble/ScrambleBar";
import { HintPanel } from "@/components/scramble/HintPanel";
import { TimerView } from "@/components/timer/TimerView";
import { TrainerView } from "@/components/trainer/TrainerView";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PBToast } from "@/components/timer/PBToast";
import { AchievementToast } from "@/components/timer/AchievementToast";
import { BottomNav, type TabId } from "@/components/nav/BottomNav";
import { cn } from "@/lib/utils/cn";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("timer");

  const mainPaneActive = tab === "timer" || tab === "trainer";

  return (
    <>
      <AppBootstrap />
      <PBToast />
      <AchievementToast />
      <div className="flex h-dvh flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between px-3 py-2">
          <SessionSwitcher />

          <div className="hidden items-center gap-1 rounded-full bg-bg-panel-2 p-1 lg:flex">
            <button
              type="button"
              onClick={() => setTab("timer")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                tab !== "trainer" ? "bg-bg-elevated text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <TimerIcon size={13} /> Timer
            </button>
            <button
              type="button"
              onClick={() => setTab("trainer")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "trainer" ? "bg-bg-elevated text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Repeat size={13} /> Trainer
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="tap-target rounded-lg text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
          >
            <Settings size={19} />
          </button>
        </header>

        <div className={cn("shrink-0", tab === "timer" ? "block" : "hidden", "lg:block")}>
          <ScrambleBar className="mt-1" />
        </div>

        <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 px-4 lg:pb-4">
          <div
            className={cn(
              "min-h-0 flex-col items-center justify-center gap-4 overflow-y-auto pb-[calc(var(--nav-height)+var(--safe-bottom)+1rem)] lg:pb-0",
              mainPaneActive ? "flex" : "hidden",
              "lg:flex",
            )}
          >
            {tab === "trainer" ? (
              <TrainerView />
            ) : (
              <>
                <TimerView />
                <HintPanel />
              </>
            )}
          </div>

          <aside
            className={cn(
              "min-h-0 flex-col gap-4 overflow-y-auto pb-[calc(var(--nav-height)+var(--safe-bottom)+1rem)] lg:pb-2",
              !mainPaneActive ? "flex" : "hidden",
              "lg:flex",
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
