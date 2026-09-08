"use client";

import { useEffect, useState } from "react";
import { Settings, Timer as TimerIcon, Repeat, Wand2 } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { SessionSwitcher } from "@/components/sessions/SessionSwitcher";
import { SolveList } from "@/components/sessions/SolveList";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { InsightsPanel } from "@/components/stats/InsightsPanel";
import { ScrambleBar } from "@/components/scramble/ScrambleBar";
import { HintPanel } from "@/components/scramble/HintPanel";
import { TimerView } from "@/components/timer/TimerView";
import { TrainerHub } from "@/components/trainer/TrainerHub";
import { AnalyzerView } from "@/components/analysis/AnalyzerView";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PBToast } from "@/components/timer/PBToast";
import { AchievementToast } from "@/components/timer/AchievementToast";
import { BottomNav, type TabId } from "@/components/nav/BottomNav";
import { AuroraBackground } from "@/components/chrome/AuroraBackground";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { cn } from "@/lib/utils/cn";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("timer");

  // "Analyze this solve" lives in the solve list, which has no way to change
  // tabs; it bumps a counter in the store instead and the shell follows. This
  // is a subscription to an external store rather than derived state, so it
  // belongs in a listener, not in the render path.
  useEffect(
    () =>
      useAnalysisStore.subscribe((state, prev) => {
        if (state.requestSeq !== prev.requestSeq) setTab("analyze");
      }),
    [],
  );

  const mainPaneActive = tab === "timer" || tab === "trainer" || tab === "analyze";

  return (
    <>
      <AppBootstrap />
      <AuroraBackground />
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
                tab !== "trainer" && tab !== "analyze" ? "bg-bg-elevated text-foreground shadow-sm" : "text-muted hover:text-foreground",
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
            <button
              type="button"
              onClick={() => setTab("analyze")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "analyze" ? "bg-bg-elevated text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Wand2 size={13} /> Analyze
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
              // No justify-center here: combined with overflow-y-auto, centering
              // pushes overflow content into negative (unreachable) scroll space
              // once it's taller than the viewport — see TrainerHub's Library
              // sub-view. Components that want vertical centering while short
              // (TimerView) already do it themselves via their own flex-1.
              "min-h-0 flex-col items-center gap-4 overflow-y-auto pb-[calc(var(--nav-height)+var(--safe-bottom)+1rem)] lg:pb-0",
              mainPaneActive ? "flex" : "hidden",
              "lg:flex",
            )}
          >
            {tab === "trainer" ? (
              <TrainerHub />
            ) : tab === "analyze" ? (
              <AnalyzerView />
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
