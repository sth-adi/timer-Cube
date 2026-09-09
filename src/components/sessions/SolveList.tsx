"use client";

import { useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { formatResult, parseTimeInput } from "@/lib/utils/time";
import { comparableTime } from "@/lib/stats/stats";
import { cn } from "@/lib/utils/cn";
import type { Penalty, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { Heart, MessageSquare, Plus, Wand2, X } from "lucide-react";

function SolveRow({ solve, index, isBest, isWorst }: { solve: Solve; index: number; isBest: boolean; isWorst: boolean }) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const setComment = useSessionStore((s) => s.setComment);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const [open, setOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(solve.comment ?? "");

  const cyclePenalty = (p: Penalty) => setPenalty(solve.id, p === solve.penalty ? "none" : p);
  const saveComment = () => {
    if (commentDraft !== (solve.comment ?? "")) setComment(solve.id, commentDraft);
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
        {solve.reconstruction && (
          <Wand2 size={11} className="text-accent mr-1" aria-label="Analyzed" />
        )}
        {solve.comment && <MessageSquare size={11} className="text-muted-2 mr-1" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg glass-panel p-2.5 shadow-lg animate-fade-in-up">
          <p className="text-muted-2 text-[11px] font-mono leading-snug mb-2 break-words">{solve.scramble}</p>
          {solve.heartRate && (
            <p className="mb-2 flex items-center gap-1 text-[11px] text-danger">
              <Heart size={11} fill="currentColor" />
              {solve.heartRate.avg} avg · {solve.heartRate.max} max bpm
            </p>
          )}
          <div className="flex items-center gap-1 mb-2">
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
                requestAnalysis(solve.scramble, solveFinalMs(solve), solve.id, solve.reconstruction);
                setOpen(false);
              }}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted hover:text-accent"
            >
              <Wand2 size={12} /> Analyze
            </button>
            <button
              type="button"
              onClick={() => removeSolve(solve.id)}
              className="tap-target -mr-1.5 rounded text-muted hover:text-danger"
              aria-label="Delete solve"
            >
              <X size={14} />
            </button>
          </div>
          <input
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onBlur={saveComment}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Add a note…"
            className="w-full rounded-md bg-bg-panel-2 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent"
          />
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

export function SolveList() {
  const solves = useSessionStore((s) => s.solves);
  const [manualOpen, setManualOpen] = useState(false);

  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const best = finite.length ? Math.min(...finite) : null;
  const worst = finite.length ? Math.max(...finite) : null;

  return (
    <div className="flex flex-col gap-1">
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

      {manualOpen && <ManualEntry onDone={() => setManualOpen(false)} />}

      {solves.length === 0 ? (
        <p className="text-muted-2 text-sm text-center py-8">No solves yet — hit space to start.</p>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[55vh] overflow-y-auto pr-1">
          {[...solves].reverse().map((solve, i) => {
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
