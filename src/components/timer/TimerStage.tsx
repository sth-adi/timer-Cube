import type { ReactNode } from "react";
import type { FxPhase } from "@/lib/fx/fxBus";
import { cn } from "@/lib/utils/cn";

/**
 * The big digits' stage: a pair of counter-rotating reactor rings and a soft
 * core glow behind them that react to what the timer is doing — drifting
 * while idle, tightening red while you hold, flaring green when ready,
 * spinning up while running. Purely decorative (pointer-events none, sized
 * off the digits, never affects layout); the styling lives in globals.css
 * and is inert at fxLevel "off" and under prefers-reduced-motion.
 */
export function TimerStage({ state, className, children }: { state: FxPhase; className?: string; children: ReactNode }) {
  return (
    <div className={cn("timer-stage", className)} data-state={state}>
      <span className="reactor reactor-a" aria-hidden="true" />
      <span className="reactor reactor-b" aria-hidden="true" />
      <span className="reactor-core" aria-hidden="true" />
      {children}
    </div>
  );
}
