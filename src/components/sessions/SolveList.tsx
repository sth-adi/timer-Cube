"use client";

import { useMemo, useState } from "react";
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
import { Check, CheckSquare, Heart, Link2, ListChecks, Loader2, MessageSquare, Plus, Square, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { hasBreakdown } from "@/lib/analysis/solveBreakdown";
import { solveSummary, type SolveSummary } from "@/lib/analysis/solveFilter";
import { CROSS_FACE_COLOR, CROSS_FACE_HEX } from "@/lib/smartcube/crossFrame";
import { PHASE_TINTS } from "@/components/stats/phaseTints";
import { SolveRecapSheet } from "@/components/recap/SolveRecapSheet";

function SolveRow({
  solve,
  index,
  isBest,
  isWorst,
  detailed,
  selecting,
}: {
  solve: Solve;
  index: number;
  isBest: boolean;
  isWorst: boolean;
  /** Show the smart-cube step bar and cases under the time. */
  detailed: boolean;
  /** In select mode a tap ticks the row instead of opening it. */
  selecting?: { ticked: boolean; toggle: () => void };
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
  const [recapOpen, setRecapOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(solve.comment ?? "");
  const [shareState, setShareState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const summary = useMemo(() => (detailed ? solveSummary(solve) : null), [detailed, solve]);

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
        onClick={() => (selecting ? selecting.toggle() : setOpen((o) => !o))}
        aria-pressed={selecting ? selecting.ticked : undefined}
        className={cn(
          "w-full flex items-center justify-between rounded-lg px-2.5 py-2.5 text-sm hover:bg-bg-panel-2 active:bg-bg-panel-2 transition-colors",
          isBest && "text-success",
          isWorst && "text-danger",
          selecting?.ticked && "bg-accent-soft",
        )}
      >
        {selecting && (selecting.ticked ? <CheckSquare size={15} className="mr-1.5 shrink-0 text-accent" /> : <Square size={15} className="mr-1.5 shrink-0 text-muted-2" />)}
        <span className="text-muted-2 w-6 text-right tabular-timer">{index}</span>
        <span className="tabular-timer ml-2 w-16 shrink-0 text-left">{formatResult(solveFinalMs(solve), solve.penalty)}</span>
        {summary ? <StepStrip summary={summary} /> : <span className="flex-1" />}
        {solve.reconstruction && <Wand2 size={11} className="text-accent mr-1" aria-label="Analyzed" />}
        {summary?.hasMistake && <TriangleAlert size={11} className="text-warning mr-1" aria-label="Mistake Radar flagged something in this solve" />}
        {solve.comment && <MessageSquare size={11} className="text-muted-2 mr-1" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-elevated p-2.5 shadow-lg animate-fade-in-up">
          {hasBreakdown(solve) && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setRecapOpen(true);
              }}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-accent-fg"
            >
              <ListChecks size={12} /> Full recap
            </button>
          )}
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
      {recapOpen && <SolveRecapSheet solve={solve} onClose={() => setRecapOpen(false)} />}
    </div>
  );
}

/**
 * A smart-cube solve at a glance: its four steps as one bar (cross, F2L,
 * OLL, PLL, each as wide as the time it took) and the last-layer cases.
 */
function StepStrip({ summary }: { summary: SolveSummary }) {
  const total = summary.steps.reduce((a, b) => a + b, 0) || 1;
  const names = ["Cross", "F2L", "OLL", "PLL"];
  const cases = [summary.oll, summary.pll].filter(Boolean).join(" · ");
  return (
    <span className="ml-1 flex min-w-0 flex-1 items-center gap-2" title={summary.steps.map((ms, i) => `${names[i]} ${formatTime(ms)}`).join(" · ")}>
      <span className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-bg-panel-2 sm:w-24" aria-hidden>
        {summary.steps.map((ms, i) => (
          <span key={i} className={PHASE_TINTS[i]} style={{ width: `${(ms / total) * 100}%` }} />
        ))}
      </span>
      {summary.crossFace !== "U" && (
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-border"
          style={{ background: CROSS_FACE_HEX[summary.crossFace] }}
          title={`${CROSS_FACE_COLOR[summary.crossFace]} cross`}
        />
      )}
      <span className="truncate text-left text-[11px] text-muted-2">{cases}</span>
    </span>
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
  /**
   * The rows to show and in what order (a filtered or re-sorted subset of
   * `solves`) — each keeps its number from `solves`, so solve #12 is still
   * #12 when it's sorted to the top. Defaults to every solve, newest first.
   */
  view?: Solve[];
  /** Select mode: which solves are ticked, and how to tick one. */
  selection?: { selected: ReadonlySet<string>; toggle: (id: string) => void };
}

export function SolveList({ solves: solvesProp, limit, hideHeader, view, selection }: SolveListProps = {}) {
  const sessionSolves = useSessionStore((s) => s.solves);
  const solves = solvesProp ?? sessionSolves;
  const [manualOpen, setManualOpen] = useState(false);

  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const best = finite.length ? Math.min(...finite) : null;
  const worst = finite.length ? Math.max(...finite) : null;

  const numberOf = useMemo(() => new Map(solves.map((s, i) => [s.id, i + 1])), [solves]);
  const ordered = view ?? [...solves].reverse();
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
        <p className="text-muted-2 text-sm text-center py-8">{view && solves.length ? "No solves match." : "No solves yet — hit space to start."}</p>
      ) : (
        <div className={cn("flex flex-col gap-0.5", limit === undefined && "max-h-[55vh] overflow-y-auto pr-1")}>
          {shown.map((solve) => {
            const t = comparableTime(solve);
            return (
              <SolveRow
                key={solve.id}
                solve={solve}
                index={numberOf.get(solve.id) ?? 0}
                detailed={limit === undefined}
                selecting={selection ? { ticked: selection.selected.has(solve.id), toggle: () => selection.toggle(solve.id) } : undefined}
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
