"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { metricsFor, type SolveMetrics } from "@/lib/analytics/solveMetrics";

/** Every analyzable smart-cube solve in your history, as metric rows (oldest first). */
export function useSolveMetrics(): SolveMetrics[] {
  const allSolves = useSessionStore((s) => s.allSolves);
  return useMemo(() => metricsFor(allSolves), [allSolves]);
}

export function AnalyticsShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              {icon} {title}
            </h1>
            <p className="text-[11px] text-muted-2">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

export function NotEnough({ need, have, what }: { need: number; have: number; what: string }) {
  return (
    <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
      <p className="text-sm text-muted">
        {what} needs at least {need} complete smart-cube solves — you have {have}.
      </p>
      <p className="text-[11px] text-muted-2">Every solve on a connected cube counts; keep going and this fills in.</p>
    </div>
  );
}
