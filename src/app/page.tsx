"use client";

import { useEffect, useState } from "react";
import { Settings, Timer as TimerIcon, Repeat, Wand2 } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { SessionSwitcher } from "@/components/sessions/SessionSwitcher";
import { SolveList } from "@/components/sessions/SolveList";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { InsightsPanel } from "@/components/stats/InsightsPanel";
import { PhaseSplitsCard } from "@/components/stats/PhaseSplitsCard";
import { ScrambleBar } from "@/components/scramble/ScrambleBar";
import { EventTagSelector } from "@/components/timer/EventTagSelector";
import { HintPanel } from "@/components/scramble/HintPanel";
import { TimerView } from "@/components/timer/TimerView";
import { SmartCubeTimer } from "@/components/timer/SmartCubeTimer";
import { TrainerHub } from "@/components/trainer/TrainerHub";
import { AnalyzerView } from "@/components/analysis/AnalyzerView";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PBToast } from "@/components/timer/PBToast";
import { AchievementToast } from "@/components/timer/AchievementToast";
import { BottomNav, type TabId } from "@/components/nav/BottomNav";
import { AuroraBackground } from "@/components/chrome/AuroraBackground";
import { ChallengeLinkBanner } from "@/components/scramble/ChallengeLinkBanner";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useNavigationStore, type PendingTrainerNav } from "@/lib/store/navigationStore";
import { cn } from "@/lib/utils/cn";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("timer");
  const [timerMode, setTimerMode] = useState<"keyboard" | "smartcube">("keyboard");
  const [pendingTrainerNav, setPendingTrainerNav] = useState<PendingTrainerNav | null>(null);

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

  // The daily practice plan card lives in the stats aside and asks to jump
  // to either the Trainer or Timer tab — see navigationStore for why this
  // goes through a store rather than a prop, same reasoning as the analyzer
  // subscription just above. A trainer-specific target also needs to reach
  // TrainerHub, which only mounts once `tab` becomes "trainer" and so can't
  // reliably catch the same store emission itself (it isn't mounted yet when
  // it fires) — passed down as a resolved, one-shot prop instead, and
  // TrainerHub tells us via onConsumedNav once it's acted on it so a later,
  // unrelated remount doesn't replay a stale request.
  useEffect(
    () =>
      useNavigationStore.subscribe((state, prev) => {
        if (state.requestSeq === prev.requestSeq || !state.target) return;
        if (state.target === "timer") {
          setTab("timer");
        } else {
          setTab("trainer");
          setPendingTrainerNav({ target: state.target, seq: state.requestSeq });
        }
      }),
    [],
  );

  const mainPaneActive = tab === "timer" || tab === "trainer" || tab === "analyze";

  // Global nav shortcuts: 1-5 jump straight to a tab, "?" toggles the
  // shortcuts reference in Settings — on top of the timer's own Space/Esc/
  // Delete handling (TimerView) and the 3D cube viewer's own arrow-key
  // rotation (CubeViewer), neither of which these keys touch.
  useEffect(() => {
    const TAB_BY_DIGIT: Partial<Record<string, TabId>> = {
      "1": "timer",
      "2": "trainer",
      "3": "analyze",
      "4": "stats",
      "5": "solves",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inField = !!target && (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable);
      if (inField) return;

      if (e.key === "?") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
        return;
      }
      if (settingsOpen) return;
      const nextTab = TAB_BY_DIGIT[e.key];
      if (nextTab) {
        e.preventDefault();
        setTab(nextTab);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

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

        <ChallengeLinkBanner onRace={() => setTab("timer")} />

        <div className={cn("shrink-0", tab === "timer" ? "block" : "hidden", "lg:block")}>
          <ScrambleBar className="mt-1" />
          <EventTagSelector />
          <div className="mt-1 flex justify-center gap-1">
            {(["keyboard", "smartcube"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTimerMode(m)}
                aria-pressed={timerMode === m}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  timerMode === m ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-muted",
                )}
              >
                {m === "keyboard" ? "Keyboard" : "Smart cube"}
              </button>
            ))}
          </div>
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
              <TrainerHub pendingNav={pendingTrainerNav} onConsumedNav={() => setPendingTrainerNav(null)} />
            ) : tab === "analyze" ? (
              <AnalyzerView />
            ) : timerMode === "smartcube" ? (
              <SmartCubeTimer />
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
              <PhaseSplitsCard />
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
