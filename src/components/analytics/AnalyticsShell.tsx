"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/analysis/EmptyState";
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
      <div className="flex min-h-dvh flex-col items-center gap-5 px-4 py-6">
        <Link href="/" className="hit flex items-center gap-1.5 rounded-md text-sm font-semibold text-foreground active:translate-y-px">
          <TimerIcon size={16} strokeWidth={1.75} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-5 pb-10">
          <div className="flex flex-col gap-1 px-1">
            <h1 className="flex items-center gap-2 text-balance text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {icon} {title}
            </h1>
            <p className="max-w-[65ch] text-pretty text-xs leading-relaxed text-muted-2">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

export function NotEnough({ need, have, what }: { need: number; have: number; what: string }) {
  return (
    <EmptyState title="Not enough solves yet" need={need} have={have} unit="smart-cube solves">
      {what} needs at least {need} complete smart-cube solves. Every solve on a connected cube counts.
    </EmptyState>
  );
}
