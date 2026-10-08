"use client";

import { memo, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useShareSolve } from "@/hooks/useShareSolve";
import { formatResult, formatTime, parseManualTime } from "@/lib/utils/time";
import { submitManualTime, withAdded, type AddedTime } from "./manualEntry";
import { comparableTime } from "@/lib/stats/stats";
import { cn } from "@/lib/utils/cn";
import { useModalLayer } from "@/hooks/useModalLayer";
import type { Penalty, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { Check, CheckSquare, Heart, Link2, ListChecks, Loader2, MessageSquare, Plus, Square, Trash2, TriangleAlert, Wand2, X } from "lucide-react";
import { hasBreakdown } from "@/lib/analysis/solveBreakdown";
import { solveSummary, type SolveSummary } from "@/lib/analysis/solveFilter";
import { CROSS_FACE_COLOR, CROSS_FACE_HEX } from "@/lib/smartcube/crossFrame";
import { PHASE_TINTS } from "@/components/stats/phaseTints";
import { SolveRecapSheet } from "@/components/recap/SolveRecapSheet";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { skeletonWidth } from "@/components/ui/skeletonWidths";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

/** How many rows the full list draws at first, and each "Show more" adds — hundreds of live rows make every edit janky. */
const PAGE_SIZE = 100;

/** The row popup's dialog panel — its own component so the modal layer (timer keys stand down, Esc, focus, Tab) lives exactly as long as the popup is open. */
function SolveSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalLayer(ref, onClose);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      className="max-h-[85vh] supports-[height:1dvh]:max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-bg-elevated p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-[var(--shadow-md)] outline-none animate-sheet-in sm:max-w-sm sm:rounded-xl sm:pb-4 sm:animate-fade-in-up"
    >
      {children}
    </div>
  );
}

// Memoized: every prop is a primitive, the solve object (replaced only when that solve changes) or a
// stable callback, so adding a solve or changing one penalty re-renders just the rows that changed.
const SolveRow = memo(function SolveRow({
  solve,
  index,
  isBest,
  isWorst,
  detailed,
  selectMode,
  ticked,
  onToggle,
}: {
  solve: Solve;
  index: number;
  isBest: boolean;
  isWorst: boolean;
  /** Show the smart-cube step bar and cases under the time. */
  detailed: boolean;
  /** In select mode a tap ticks the row instead of opening it. */
  selectMode: boolean;
  ticked: boolean;
  onToggle?: (id: string) => void;
}) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const setComment = useSessionStore((s) => s.setComment);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(solve.comment ?? "");
  const summary = useMemo(() => (detailed ? solveSummary(solve) : null), [detailed, solve]);

  const cyclePenalty = (p: Penalty) => setPenalty(solve.id, p === solve.penalty ? "none" : p);
  const saveComment = () => {
    if (commentDraft !== (solve.comment ?? "")) setComment(solve.id, commentDraft);
  };
  // Every way out of the popup (Esc, backdrop, X, buttons) goes through here so a note typed but not yet blurred isn't lost.
  const closeSheet = () => {
    saveComment();
    setOpen(false);
  };

  const { shareable, state: shareState, share: onShare } = useShareSolve(solve);
  // A solve with a saved smart-cube breakdown opens its recap on one tap; the generic popup is for the rest (and "More").
  const smart = useMemo(() => hasBreakdown(solve), [solve]);

  return (
    <div className="relative">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => (selectMode ? onToggle?.(solve.id) : smart ? setRecapOpen(true) : setOpen((o) => !o))}
          aria-pressed={selectMode ? ticked : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center justify-between rounded-md px-2 py-0.5 text-sm transition-colors active:bg-bg-panel-2 lg:min-h-0 lg:py-2.5 [@media(hover:hover)]:hover:bg-bg-panel-2",
            isBest && "text-success",
            isWorst && "text-danger",
            selectMode && ticked && "bg-accent-soft",
          )}
        >
          {selectMode &&
            (ticked ? <CheckSquare size={15} strokeWidth={1.75} className="mr-1.5 shrink-0 text-accent" /> : <Square size={15} strokeWidth={1.75} className="mr-1.5 shrink-0 text-muted-2" />)}
          <span className="w-7 shrink-0 text-right text-xs text-muted-2 tabular-timer">{index}</span>
          <span className="tabular-timer ml-3 w-[4.5rem] shrink-0 text-left font-medium">{formatResult(solveFinalMs(solve), solve.penalty)}</span>
          {summary ? <StepStrip summary={summary} /> : <span className="flex-1" />}
          {solve.reconstruction && <Wand2 size={14} strokeWidth={1.75} className="mr-1 shrink-0 text-accent" role="img" aria-label="Reconstruction saved" />}
          {summary?.hasMistake && <TriangleAlert size={14} strokeWidth={1.75} className="mr-1 shrink-0 text-warning" role="img" aria-label="Mistake flagged" />}
          {solve.comment && <MessageSquare size={14} strokeWidth={1.75} className="mr-1 shrink-0 text-muted-2" role="img" aria-label="Has a note" />}
        </button>
        {detailed && !selectMode && (
          <button
            type="button"
            onClick={() => void removeSolve(solve.id)}
            aria-label={`Delete solve ${index}`}
            title="Delete (undo from the toast)"
            className="hit-y ml-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-2 transition-colors hover:text-danger active:text-danger"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {/* Portalled to the body: the list scrolls (overflow clips an absolute popup under the last rows) and an
          animated ancestor would trap a fixed overlay. A bottom sheet on phones, a centred card from sm up. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={closeSheet}>
            <SolveSheet label={`Solve ${index}`} onClose={closeSheet}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="tabular-timer text-lg font-semibold text-foreground">
                  #{index} · {formatResult(solveFinalMs(solve), solve.penalty)}
                </p>
                <button type="button" onClick={closeSheet} aria-label="Close" className="tap-target -mr-2 text-muted hover:text-foreground">
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
              {smart && (
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    setRecapOpen(true);
                  }}
                  className="mb-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-accent-fg"
                >
                  <ListChecks size={12} strokeWidth={1.75} /> Full recap
                </button>
              )}
              <p className="text-muted-2 text-[11px] font-mono leading-snug mb-2 break-words">{solve.scramble}</p>
              {solve.heartRate && (
                <p className="mb-2 flex items-center gap-1 text-[11px] text-danger">
                  <Heart size={11} strokeWidth={1.75} fill="currentColor" />
                  {solve.heartRate.avg} avg · {solve.heartRate.max} max bpm
                </p>
              )}
              {solve.crossMs !== undefined && <p className="mb-2 text-[11px] text-muted">cross {formatTime(solve.crossMs)}</p>}
              {solve.orientedReconstruction && (
                <div className="mb-2">
                  <p className="text-[11px] font-medium text-accent">
                    Gyro reconstruction · {solve.rotations?.length ?? 0} regrip{solve.rotations?.length === 1 ? "" : "s"}
                  </p>
                  <p className="max-h-20 overflow-y-auto break-words font-mono text-[11px] leading-snug text-muted">{solve.orientedReconstruction}</p>
                </div>
              )}
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => cyclePenalty("plus2")}
                  className={cn(
                    "min-h-10 min-w-10 rounded-md px-2 py-1 text-xs font-medium",
                    solve.penalty === "plus2" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground",
                  )}
                >
                  +2
                </button>
                <button
                  type="button"
                  onClick={() => cyclePenalty("dnf")}
                  className={cn(
                    "min-h-10 min-w-10 rounded-md px-2 py-1 text-xs font-medium",
                    solve.penalty === "dnf" ? "bg-danger/20 text-danger" : "text-muted hover:text-foreground",
                  )}
                >
                  DNF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    requestAnalysis(solve.scramble, solveFinalMs(solve), solve.id, solve.reconstruction, solve.moveTimestamps);
                    closeSheet();
                    // The shell that owns the Analyze tab only lives on "/" — the
                    // solve list is also embedded on /solves, so a click there
                    // needs to actually navigate, not just bump the store (which
                    // nothing on this page is listening to switch tabs on).
                    if (pathname !== "/") router.push("/?jump=analyze");
                  }}
                  className="ml-auto flex min-h-10 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-accent"
                >
                  <Wand2 size={12} strokeWidth={1.75} /> Analyze
                </button>
                {shareable && (
                  <button
                    type="button"
                    onClick={() => void onShare()}
                    disabled={shareState === "busy"}
                    title="Copy a shareable link to this solve's reconstruction and stats"
                    className={cn(
                      "flex min-h-10 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                      shareState === "copied" ? "text-success" : shareState === "error" ? "text-danger" : "text-muted hover:text-accent",
                    )}
                  >
                    {shareState === "busy" ? (
                      <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                    ) : shareState === "copied" ? (
                      <Check size={12} strokeWidth={1.75} />
                    ) : (
                      <Link2 size={12} strokeWidth={1.75} />
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
                  placeholder="Add a note"
                  className="min-h-10 min-w-0 flex-1 rounded-md bg-bg-panel-2 border border-border px-2 py-1 text-[16px] text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent sm:min-h-0 sm:text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void removeSolve(solve.id);
                  }}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                  aria-label="Delete solve"
                >
                  <Trash2 size={12} strokeWidth={1.75} /> Delete
                </button>
              </div>
            </SolveSheet>
          </div>,
          document.body,
        )}
      {recapOpen && (
        <SolveRecapSheet
          solve={solve}
          onClose={() => setRecapOpen(false)}
          onMore={() => {
            setRecapOpen(false);
            setOpen(true);
          }}
        />
      )}
    </div>
  );
});

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
      <span className="flex h-1.5 w-16 shrink-0 gap-px overflow-hidden rounded-sm bg-bg-panel-2 sm:w-24" aria-hidden>
        {summary.steps.map((ms, i) => (
          <span key={i} className={PHASE_TINTS[i]} style={{ width: `${(ms / total) * 100}%` }} />
        ))}
      </span>
      {summary.crossFace !== "U" && (
        <span
          className="h-2 w-2 shrink-0 rounded-[2px] ring-1 ring-border"
          style={{ background: CROSS_FACE_HEX[summary.crossFace] }}
          title={`${CROSS_FACE_COLOR[summary.crossFace]} cross`}
        />
      )}
      <span className="truncate text-left text-xs text-muted-2">{cases}</span>
    </span>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const solves = useSessionStore((s) => s.solves);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  // Digits alone read csTimer-style ("1234" → 12.34); echo what that means so it's never a surprise.
  const preview = /^\d+$/.test(value.trim()) ? parseManualTime(value) : null;
  // The last few times added here, each one tap from deleted — for the typo you spot a second later.
  const [added, setAdded] = useState<AddedTime[]>([]);
  const stillThere = new Set(solves.map((x) => x.id));
  const recent = added.filter((x) => stillThere.has(x.id));

  // Texts being saved right now: Enter pressed twice on the same text must not record it twice.
  const inFlight = useRef(new Set<string>());

  const submit = async () => {
    const typed = value;
    const key = typed.trim();
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const result = await submitManualTime(typed, scramble, recordSolve);
      if (!result.ok) {
        // A failed save keeps the text (the save-error banner explains); only a typo gets a message here.
        if (result.error !== null) setError(result.error);
        return;
      }
      setAdded((a) => withAdded(a, result.entry));
      // Another time may already be typed in behind this one — only clear what was just saved.
      setValue((v) => (v === typed ? "" : v));
      void nextScramble();
    } finally {
      inFlight.current.delete(key);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-2">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Time"
          aria-invalid={error !== null}
          aria-describedby={hintId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onDone();
          }}
          placeholder="12.34 or 1:02.34"
          className={cn(
            "min-h-10 min-w-0 flex-1 rounded-md bg-bg-panel-2 border px-2 py-1 text-[16px] tabular-timer sm:min-h-0 sm:text-xs text-foreground placeholder:text-muted-2 focus:outline-none",
            error !== null ? "border-danger" : "border-border focus:border-accent",
          )}
        />
        <button
          type="button"
          onClick={() => void submit()}
          className="min-h-10 rounded-md bg-accent-soft px-3 py-1 text-xs font-medium text-accent active:translate-y-px sm:min-h-0 sm:px-2"
        >
          Add
        </button>
        {recent.length > 0 && (
          <button type="button" onClick={onDone} className="min-h-10 px-2 text-xs text-muted-2 hover:text-muted sm:min-h-0 sm:px-1">
            Done
          </button>
        )}
      </div>
      <p id={hintId} className={cn("px-0.5 text-[11px]", error !== null ? "text-danger" : "text-muted-2")} role={error !== null ? "alert" : undefined}>
        {error ?? (preview?.ok ? `= ${formatTime(preview.ms)}` : "\u00a0")}
      </p>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" aria-label="Times just added">
          {recent.map((x) => (
            <span key={x.id} className="flex items-center gap-0.5 rounded-md bg-bg-panel-2 py-0.5 pl-2 pr-0.5 text-xs tabular-timer text-foreground">
              {formatTime(x.ms)}
              <button
                type="button"
                onClick={() => void removeSolve(x.id)}
                aria-label={`Delete ${formatTime(x.ms)}`}
                className="hit grid h-5 w-5 place-items-center rounded-sm text-muted-2 hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={11} strokeWidth={1.75} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What stands in for the rows until the history has been read from the device: the same row footprint as a real
 * one (number, time, step bar, and the delete column when rows are detailed), so the rows land without moving.
 */
function SolveListSkeleton({ rows, detailed }: { rows: number; detailed: boolean }) {
  return (
    <SkeletonGroup label="Loading solves" className={cn("flex flex-col divide-y divide-border/70", detailed && "max-h-[55vh] overflow-hidden pr-1")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center" data-testid="solve-row-skeleton">
          <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-md px-2 py-0.5 lg:min-h-0 lg:py-2.5">
            <span className="flex h-5 w-7 items-center justify-end">
              <Skeleton className="h-3 w-4" />
            </span>
            <span className="ml-3 flex h-5 w-[4.5rem] shrink-0 items-center">
              <Skeleton className="h-3.5" style={{ width: skeletonWidth(i, 60, 95) }} />
            </span>
            {detailed && (
              <span className="ml-1 flex min-w-0 flex-1 items-center gap-2 pl-1">
                <Skeleton round className="h-1.5 w-16 shrink-0 sm:w-24" />
                <Skeleton className="h-2.5" style={{ width: skeletonWidth(i + 3, 15, 35) }} />
              </span>
            )}
          </div>
          {detailed && <span className="ml-0.5 h-11 w-11 shrink-0" aria-hidden="true" />}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Nothing to list: say why and what to do, centred, with room to breathe. `filtered` = there are solves, none match. */
function EmptySolves({ filtered, compact, addByHand }: { filtered: boolean; compact: boolean; addByHand: boolean }) {
  const touch = useCoarsePointer();
  const hint = filtered
    ? "Try a different filter, or clear it to see them all."
    : addByHand
      ? "Solve with the timer, or tap + to add a time by hand."
      : touch
        ? "Touch and hold the timer to start."
        : "Hit space to start.";
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-4 text-center", compact ? "py-6" : "py-12")} data-testid="solves-empty">
      <p className="text-sm font-medium text-foreground">{filtered ? "No solves match" : "No solves yet"}</p>
      <p className="max-w-[16rem] text-balance text-xs leading-relaxed text-muted-2">{hint}</p>
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
  // The history is read from the device on first open: until then an empty list means "not loaded yet", not "no solves".
  // (If the storage can't be opened at all it never loads, so that case falls through to the empty state.)
  const loaded = useSessionStore((s) => s.loaded);
  const openFailed = useSessionStore((s) => s.saveError?.kind === "open");
  const solves = solvesProp ?? sessionSolves;
  const [manualOpen, setManualOpen] = useState(false);

  // The full list draws the newest `visible` rows; select-all and bulk actions live in the parent and
  // work from its full filtered list (`view`), so rows that aren't drawn yet are still covered.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const toggle = selection?.toggle;
  const selected = selection?.selected;

  const { best, worst, finiteCount } = useMemo(() => {
    const finite = solves.map(comparableTime).filter((t) => Number.isFinite(t));
    return {
      best: finite.length ? Math.min(...finite) : null,
      worst: finite.length ? Math.max(...finite) : null,
      finiteCount: finite.length,
    };
  }, [solves]);

  const numberOf = useMemo(() => new Map(solves.map((s, i) => [s.id, i + 1])), [solves]);
  const ordered = useMemo(() => view ?? [...solves].reverse(), [view, solves]);
  const shown = ordered.slice(0, limit !== undefined ? limit : visible);
  const hidden = limit === undefined ? ordered.length - shown.length : 0;

  return (
    <div className="flex flex-col gap-1">
      {!hideHeader && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-2">Solves</span>
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            aria-label="Add manual time"
            className={cn("tap-target -mr-2 rounded-md transition-colors", manualOpen ? "text-accent" : "text-muted hover:text-foreground")}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {!hideHeader && manualOpen && <ManualEntry onDone={() => setManualOpen(false)} />}

      {!loaded && !openFailed ? (
        <SolveListSkeleton rows={limit ?? 12} detailed={limit === undefined} />
      ) : shown.length === 0 ? (
        <EmptySolves filtered={!!view && solves.length > 0} compact={limit !== undefined} addByHand={!hideHeader} />
      ) : (
        <div className={cn("flex animate-fade-in-up flex-col divide-y divide-border/70", limit === undefined && "max-h-[55vh] overflow-y-auto pr-1")}>
          {shown.map((solve) => {
            const t = comparableTime(solve);
            return (
              <SolveRow
                key={solve.id}
                solve={solve}
                index={numberOf.get(solve.id) ?? 0}
                detailed={limit === undefined}
                selectMode={!!selection}
                ticked={!!selected?.has(solve.id)}
                onToggle={toggle}
                isBest={best !== null && t === best}
                isWorst={worst !== null && t === worst && finiteCount > 2}
              />
            );
          })}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="hit-y mx-auto my-2 rounded-md px-3 py-1.5 text-xs font-medium text-accent"
            >
              Show {Math.min(PAGE_SIZE, hidden)} more
              <span className="ml-1 text-muted-2">({hidden} hidden)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
