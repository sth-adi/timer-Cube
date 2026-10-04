"use client";

import { useMemo } from "react";
import type { Solve } from "@/types";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { scopedSolves } from "@/lib/stats/scope";
import { normalSolves } from "@/lib/stats/stats";

/**
 * The solves the stats/insights views describe: `rawSolves` is the Stats scope
 * (this session or every session of its event) with every penalty and event
 * tag, `solves` is the same list minus OH/feet/BLD-tagged solves (2-handed
 * timing only). One place so the panels and the share card always agree.
 */
export function useStatsSolves(): { rawSolves: Solve[]; solves: Solve[] } {
  const sessionSolves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const scope = useSettingsStore((s) => s.statsScope);
  const rawSolves = useMemo(
    () => scopedSolves(scope, activeSessionId, sessions, sessionSolves, allSolves),
    [scope, activeSessionId, sessions, sessionSolves, allSolves],
  );
  const solves = useMemo(() => normalSolves(rawSolves), [rawSolves]);
  return { rawSolves, solves };
}
