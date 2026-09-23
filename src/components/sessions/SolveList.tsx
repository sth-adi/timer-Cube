"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useAuthStore } from "@/lib/store/authStore";
import { displayUsername } from "@/lib/auth/username";
import { createSharedSolve } from "@/lib/social/shareSolve";
import { formatResult, formatTime, parseTimeInput } from "@/lib/utils/time";
import { comparableTime } from "@/lib/stats/stats";
import { cn } from "@/lib/utils/cn";
import type { Penalty, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { Check, Heart, Link2, Loader2, MessageSquare, Plus, Trash2, Wand2 } from "lucide-react";

function SolveRow({
  solve,
  index,
  isBest,
  isWorst,
}: {
  solve: Solve;
  index: number;
  isBest: boolean;
  isWorst: boolean;
}) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const setComment = useSessionStore((s) => s.setComment);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const sessions = useSessionStore((s) => s.sessions);
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(solve.comment ?? "");
  const [shareState, setShareState] = useState<"idle" | "busy" | "copied" | "error">("idle");

  const cyclePenalty = (p: Penalty) => setPenalty(solve.id, p === solve.penalty ? "none" : p);
  const saveComment = () => {
    if (commentDraft !== (solve.comment ?? "")) setComment(solve.id, commentDraft);
  };

  // Real per-move timing only exists for a solve captured live off a smart
  // cube — that's the whole point of a shared replay (it plays back at the
  // cuber's actual pace, not a flat tempo), so sharing is only offered here.
  // A DNF has no finish time worth showing on the other end either.
  const shareable = !!solve.reconstruction && !!solve.moveTimestamps && solve.penalty !== "dnf";

  const onShare = async () => {
    const finalMs = solveFinalMs(solve);
    if (!shareable || finalMs === null) return;
    setShareState("busy");
    const puzzle = sessions.find((s) => s.id === solve.sessionId)?.event ?? "333";
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
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2000);
      return;
    }
    const url = `${window.location.origin}/solve/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      // Clipboard access can be denied — the link still exists, just show it instead of a silent failure.
      window.prompt("Copy this link:", url);
      setShareState("idle");
      return;
    }
    setTimeout(() => setShareState("idle"), 2000);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between rounded-lg px-2.5 py-2.5 text-sm hover:bg-bg-panel-2 active:bg-bg-panel-2 transition-colors",
          isBest && "text-success",
          isWorst && "text-danger",
        )}
      >
        <span className="text-muted-2 w-6 text-right tabular-timer">{index}</span>
        <span className="tabular-timer flex-1 text-left ml-2">{formatResult(solveFinalMs(solve), solve.penalty)}</span>
        {solve.reconstruction && <Wand2 size={11} className="text-accent mr-1" aria-label="Analyzed" />}
        {solve.comment && <MessageSquare size={11} className="text-muted-2 mr-1" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-elevated p-2.5 shadow-lg animate-fade-in-up">
          <p className="text-muted-2 text-[11px] font-mono leading-snug mb-2 break-words">{solve.scramble}</p>
          {solve.heartRate && (
            <p className="mb-2 flex items-center gap-1 text-[11px] text-danger">
              <Heart size={11} fill="currentColor" />
              {solve.heartRate.avg} avg · {solve.heartRate.max} max bpm
            </p>
          )}
          {solve.crossMs !== undefined && (
            <p className="mb-2 text-[11px] text-muted">cross {formatTime(solve.crossMs)}</p>
          )}
          {solve.orientedReconstruction && (
            <div className="mb-2">
              <p className="text-[10px] font-medium text-accent">
                Gyro reconstruction · {solve.rotations?.length ?? 0} regrip{solve.rotations?.length === 1 ? "" : "s"}
              </p>
              <p className="max-h-20 overflow-y-auto break-words font-mono text-[10px] leading-snug text-muted">
                {solve.orientedReconstruction}
              </p>
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => cyclePenalty("plus2")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                solve.penalty === "plus2" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground",
              )}
            >
              +2
            </button>
            <button
              type="button"
              onClick={() => cyclePenalty("dnf")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                solve.penalty === "dnf" ? "bg-danger/20 text-danger" : "text-muted hover:text-foreground",
              )}
            >
              DNF
            </button>
            <button
              type="button"
              onClick={() => {
                requestAnalysis(
                  solve.scramble,
                  solveFinalMs(solve),
                  solve.id,
                  solve.reconstruction,
                  solve.moveTimestamps,
                );
                setOpen(false);
                // The shell that owns the Analyze tab only lives on "/" — the
                // solve list is also embedded on /solves, so a click there
                // needs to actually navigate, not just bump the store (which
                // nothing on this page is listening to switch tabs on).
                if (pathname !== "/") router.push("/?jump=analyze");
              }}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted hover:text-accent"
            >
              <Wand2 size={12} /> Analyze
            </button>
            {shareable && (
              <button
                type="button"
                onClick={() => void onShare()}
                disabled={shareState === "busy"}
                title="Copy a shareable link to this solve's reconstruction and stats"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                  shareState === "copied"
                    ? "text-success"
                    : shareState === "error"
                      ? "text-danger"
                      : "text-muted hover:text-accent",
                )}
              >
                {shareState === "busy" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : shareState === "copied" ? (
                  <Check size={12} />
                ) : (
                  <Link2 size={12} />
                )}
                {shareState === "copied" ? "Copied" : shareState === "error" ? "Failed" : "Share"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onBlur={saveComment}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Add a note…"
              className="min-w-0 flex-1 rounded-md bg-bg-panel-2 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void removeSolve(solve.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
              aria-label="Delete solve"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    const ms = parseTimeInput(value);
    if (ms === null) {
      setError(true);
      return;
    }
    recordSolve(ms, scramble);
    void nextScramble();
    onDone();
  };

  return (
    <div className="flex items-center gap-1.5 px-1 pb-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        placeholder="12.34 or 1:02.34"
        className={cn(
          "flex-1 rounded-md bg-bg-panel-2 border px-2 py-1 text-xs tabular-timer text-foreground placeholder:text-muted-2 focus:outline-none",
          error ? "border-danger" : "border-border focus:border-accent",
        )}
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:brightness-110"
      >
        Add
      </button>
    </div>
  );
}

interface SolveListProps {
  /** All solves to render — defaults to the active session's own list, but /solves passes a tab-filtered subset. */
  solves?: Solve[];
  /**
   * Caps the list to the N most recent solves and drops the manual-entry
   * control and internal scroll cap — for the aside's "recent solves"
   * preview, which links out to the full /solves page for everything else
   * rather than growing its own scroller.
   */
  limit?: number;
  /** Hides the "Solves" header row + add-time button — the preview widget supplies its own heading instead. */
  hideHeader?: boolean;
}

export function SolveList({ solves: solvesProp, limit, hideHeader }: SolveListProps = {}) {
  const sessionSolves = useSessionStore((s) => s.solves);
  const solves = solvesProp ?? sessionSolves;
  const [manualOpen, setManualOpen] = useState(false);

  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const best = finite.length ? Math.min(...finite) : null;
  const worst = finite.length ? Math.max(...finite) : null;

  const ordered = [...solves].reverse();
  const shown = limit !== undefined ? ordered.slice(0, limit) : ordered;

  return (
    <div className="flex flex-col gap-1">
      {!hideHeader && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-2">Solves</span>
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            aria-label="Add manual time"
            className={cn(
              "tap-target -mr-2 rounded-full transition-colors",
              manualOpen ? "text-accent" : "text-muted hover:text-foreground",
            )}
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {!hideHeader && manualOpen && <ManualEntry onDone={() => setManualOpen(false)} />}

      {shown.length === 0 ? (
        <p className="text-muted-2 text-sm text-center py-8">No solves yet — hit space to start.</p>
      ) : (
        <div className={cn("flex flex-col gap-0.5", limit === undefined && "max-h-[55vh] overflow-y-auto pr-1")}>
          {shown.map((solve, i) => {
            const t = comparableTime(solve);
            return (
              <SolveRow
                key={solve.id}
                solve={solve}
                index={solves.length - i}
                isBest={best !== null && t === best}
                isWorst={worst !== null && t === worst && finite.length > 2}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
