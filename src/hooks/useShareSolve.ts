"use client";

import { useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useAuthStore } from "@/lib/store/authStore";
import { displayUsername } from "@/lib/auth/username";
import { createSharedSolve } from "@/lib/social/shareSolve";
import { solveFinalMs, type Solve } from "@/types";

export type ShareState = "idle" | "busy" | "copied" | "error";

/**
 * Copies a shareable link to a solve's reconstruction and stats — shared by the
 * row popup and the recap sheet.
 *
 * Real per-move timing only exists for a solve captured live off a smart cube —
 * that's the whole point of a shared replay (it plays back at the cuber's actual
 * pace, not a flat tempo), so sharing is only offered there. A DNF has no finish
 * time worth showing on the other end either.
 */
export function useShareSolve(solve: Solve): { shareable: boolean; state: ShareState; share: () => Promise<void> } {
  const [state, setState] = useState<ShareState>("idle");
  const shareable = !!solve.reconstruction && !!solve.moveTimestamps && solve.penalty !== "dnf";

  const share = async () => {
    const finalMs = solveFinalMs(solve);
    if (!shareable || finalMs === null) return;
    setState("busy");
    // Read on demand: subscribing every row to these would re-render the whole list when they change.
    const user = useAuthStore.getState().user;
    const puzzle = useSessionStore.getState().sessions.find((s) => s.id === solve.sessionId)?.event ?? "333";
    const id = await createSharedSolve({
      scramble: solve.scramble,
      reconstruction: solve.reconstruction!,
      timeMs: finalMs,
      moveTimestamps: solve.moveTimestamps ?? null,
      puzzle,
      event: solve.event ?? null,
      username: user ? displayUsername(user) : null,
    });
    if (!id) {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
      return;
    }
    const url = `${window.location.origin}/solve/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      // Clipboard access can be denied — the link still exists, just show it instead of a silent failure.
      window.prompt("Copy this link:", url);
      setState("idle");
      return;
    }
    setTimeout(() => setState("idle"), 2000);
  };

  return { shareable, state, share };
}
