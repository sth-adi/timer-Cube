"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { SessionSwitcher } from "@/components/sessions/SessionSwitcher";
import { SolveList } from "@/components/sessions/SolveList";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { ScrambleBar } from "@/components/scramble/ScrambleBar";
import { HintPanel } from "@/components/scramble/HintPanel";
import { TimerView } from "@/components/timer/TimerView";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PBToast } from "@/components/timer/PBToast";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <AppBootstrap />
      <PBToast />
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-4 py-3">
          <SessionSwitcher />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
          >
            <Settings size={18} />
          </button>
        </header>

        <ScrambleBar className="mt-2" />

        <main className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 px-4 pb-4">
          <div className="flex flex-col items-center justify-center gap-4">
            <TimerView />
            <HintPanel />
          </div>

          <aside className="flex flex-col gap-4 pb-4">
            <StatsPanel />
            <div className="glass-panel flex-1 rounded-2xl p-3">
              <SolveList />
            </div>
          </aside>
        </main>
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
