"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, Merge, Pencil, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { summarizeSessions } from "@/lib/sessions/activeSession";
import { planTidy, type TidyPlan } from "@/lib/sessions/tidy";
import { WCA_EVENTS, type Session } from "@/types";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/Skeleton";
import { SessionCompareSheet } from "./SessionCompareSheet";

function lastUsed(at: number | null): string {
  if (at === null) return "empty";
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Pending = { kind: "rename"; id: string; name: string } | { kind: "merge"; id: string } | { kind: "delete"; id: string } | { kind: "tidy" } | null;

export function SessionSwitcher() {
  const sessions = useSessionStore((s) => s.sessions);
  const allSolves = useSessionStore((s) => s.allSolves);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const addSession = useSessionStore((s) => s.addSession);
  const renameSessionById = useSessionStore((s) => s.renameSessionById);
  const mergeSessions = useSessionStore((s) => s.mergeSessions);
  const removeSession = useSessionStore((s) => s.removeSession);
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pickingEvent, setPickingEvent] = useState(false);
  const [tidyResult, setTidyResult] = useState<string | null>(null);

  const summary = useMemo(() => summarizeSessions(allSolves), [allSolves]);
  const tidyPlan = useMemo(() => planTidy(sessions, allSolves, activeId), [sessions, allSolves, activeId]);
  const tidyable = sessions.length >= 2 && (tidyPlan.merges.length > 0 || tidyPlan.removeEmpty.length > 0);
  const countOf = (id: string) => summary.get(id)?.count ?? 0;
  const active = sessions.find((s) => s.id === activeId);
  const nameOf = (id: string) => sessions.find((s) => s.id === id)?.name ?? "Session";

  const close = () => {
    setOpen(false);
    setManaging(false);
    setPending(null);
    setPickingEvent(false);
    setTidyResult(null);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const tidyUp = async () => {
    // Planned again from the live store: a sync may have changed things since the confirm was shown.
    const { sessions: now, allSolves: nowSolves, activeSessionId } = useSessionStore.getState();
    const plan: TidyPlan = planTidy(now, nowSolves, activeSessionId);
    for (const m of plan.merges) await mergeSessions(m.from, m.into);
    for (const id of plan.removeEmpty) await removeSession(id);
    const done = [];
    if (plan.merges.length) done.push(`merged ${plan.merges.length} session${plan.merges.length === 1 ? "" : "s"}`);
    if (plan.removeEmpty.length) done.push(`removed ${plan.removeEmpty.length} empty`);
    setTidyResult(done.length ? `Done: ${done.join(", ")}.` : "Nothing left to tidy.");
  };

  const row = (s: Session) => {
    const count = countOf(s.id);
    const isActive = s.id === activeId;
    const meta = (
      <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-2">
        <span className="tabular-nums">{count} solve{count === 1 ? "" : "s"}</span>·<span>{lastUsed(summary.get(s.id)?.lastSolveAt ?? null)}</span>
        {s.event !== "333" && <span>· {WCA_EVENTS.find((e) => e.id === s.event)?.label}</span>}
      </span>
    );

    if (pending?.kind === "rename" && pending.id === s.id) {
      return (
        <form
          key={s.id}
          className="flex items-center gap-1 px-1.5 py-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => renameSessionById(s.id, pending.name));
          }}
        >
          <input
            autoFocus
            value={pending.name}
            maxLength={40}
            onChange={(e) => setPending({ ...pending, name: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && setPending(null)}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg-panel-2 px-2 py-1 text-[16px] text-foreground focus:border-accent focus:outline-none sm:text-sm"
            aria-label="Session name"
          />
          <button type="submit" disabled={busy} aria-label="Save name" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-accent hover:bg-bg-panel-2">
            <Check size={15} />
          </button>
          <button type="button" onClick={() => setPending(null)} aria-label="Cancel" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-2 hover:bg-bg-panel-2">
            <X size={15} />
          </button>
        </form>
      );
    }

    if (pending?.kind === "merge" && pending.id === s.id) {
      const targets = sessions.filter((t) => t.id !== s.id);
      return (
        <div key={s.id} className="rounded-lg bg-bg-panel-2/70 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] leading-snug text-muted">
            Move {count} solve{count === 1 ? "" : "s"} from <span className="font-semibold text-foreground">{s.name}</span> into… (it&apos;s removed afterwards)
          </p>
          <div className="flex flex-col gap-0.5">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => void run(() => mergeSessions(s.id, t.id))}
                className="flex min-h-10 items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm text-foreground/90 hover:bg-bg-elevated disabled:opacity-50"
              >
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-2">{countOf(t.id)} solves</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPending(null)} className="flex min-h-10 items-center px-2 text-xs text-muted-2 hover:text-muted">
            Cancel
          </button>
        </div>
      );
    }

    if (pending?.kind === "delete" && pending.id === s.id) {
      return (
        <div key={s.id} className="rounded-lg bg-danger/10 px-2.5 py-2">
          <p className="text-[11px] leading-snug text-foreground">
            Delete <span className="font-semibold">{s.name}</span>
            {count > 0 ? (
              <>
                {" "}
                and its <span className="font-semibold text-danger">{count} solves</span>? This removes them on every synced device.
              </>
            ) : (
              "? It has no solves."
            )}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => removeSession(s.id))}
              className="hit-y rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Delete
            </button>
            <button type="button" onClick={() => setPending(null)} className="hit-y px-2.5 text-xs text-muted">
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={s.id} className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            void switchSession(s.id);
            close();
          }}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-start rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-panel-2",
            isActive ? "text-accent" : "text-foreground/90",
          )}
          aria-current={isActive || undefined}
        >
          <span className="max-w-full truncate font-medium">{s.name}</span>
          {meta}
        </button>
        {managing && (
          <>
            <button
              type="button"
              onClick={() => setPending({ kind: "rename", id: s.id, name: s.name })}
              aria-label={`Rename ${s.name}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-2 hover:bg-bg-panel-2 hover:text-foreground"
            >
              <Pencil size={13} />
            </button>
            {sessions.length > 1 && count > 0 && (
              <button
                type="button"
                onClick={() => setPending({ kind: "merge", id: s.id })}
                aria-label={`Merge ${s.name} into another session`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-2 hover:bg-bg-panel-2 hover:text-foreground"
              >
                <Merge size={13} />
              </button>
            )}
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={() => setPending({ kind: "delete", id: s.id })}
                aria-label={`Delete ${s.name}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-2 hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/90 hover:bg-bg-panel-2 transition-colors"
        aria-expanded={open}
      >
        {active ? (
          <span className="max-w-[9rem] truncate">{active.name}</span>
        ) : (
          // The sessions are still being read: hold the name's width instead of printing a word that is about to change.
          <>
            <span className="sr-only">Session</span>
            <Skeleton className="h-3.5 w-[4.5rem]" />
          </>
        )}
        {active && <span className="text-[11px] font-normal tabular-nums text-muted-2">{countOf(active.id)}</span>}
        {active && active.event !== "333" && (
          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
            {WCA_EVENTS.find((e) => e.id === active.event)?.label}
          </span>
        )}
        <ChevronDown size={14} className="text-muted-2" />
      </button>
      {open && (
        <>
          {/* Tap anywhere else to close. */}
          <button type="button" aria-label="Close sessions" className="fixed inset-0 z-10 cursor-default" onClick={close} />
          <div className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl glass-panel p-1.5 shadow-lg">
            <div className="flex items-center justify-between px-2 pb-2.5 pt-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">Sessions</span>
              <button
                type="button"
                onClick={() => {
                  setManaging((m) => !m);
                  setPending(null);
                  setTidyResult(null);
                }}
                aria-pressed={managing}
                className={cn(
                  "hit-y flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  managing ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
                )}
              >
                <Settings2 size={12} /> {managing ? "Done" : "Manage"}
              </button>
            </div>
            <div className="flex max-h-[55vh] flex-col gap-0.5 overflow-y-auto">{sessions.map(row)}</div>
            <div className="my-1 h-px bg-border" />
            {pickingEvent ? (
              <div className="px-1 py-1">
                <div className="flex items-center gap-1">
                  {WCA_EVENTS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        const count = sessions.filter((s) => s.event === e.id).length;
                        const name = e.id === "333" ? `Session ${count + 1}` : `${e.label} Session ${count + 1}`;
                        void addSession(name, e.id);
                        close();
                      }}
                      className="flex min-h-11 flex-1 flex-col items-center justify-center rounded-lg py-1.5 text-center text-xs font-medium text-muted hover:text-accent hover:bg-bg-panel-2 transition-colors"
                    >
                      {e.label}
                      <span className={cn("text-[10px] font-normal", e.randomState ? "text-muted-2" : "text-warning")}>
                        {e.randomState ? "random-state" : "random-move"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 max-w-64 px-2 text-[11px] leading-snug text-muted-2">
                  Only 3x3 scrambles are WCA-style random-state. 2x2, 4x4 and 5x5 use random-move scrambles — fine for practice, not
                  competition-grade.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickingEvent(true)}
                className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
              >
                <Plus size={14} /> New session
              </button>
            )}
            {sessions.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setCompareOpen(true);
                  close();
                }}
                className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
              >
                <ArrowLeftRight size={14} /> Compare sessions
              </button>
            )}
            {managing && pending?.kind === "tidy" && (
              <div className="mt-1 rounded-lg bg-bg-panel-2/70 px-2.5 py-2">
                <p className="text-[11px] leading-snug text-foreground">{tidyPlan.summary}. Removed sessions sync to your other devices.</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(tidyUp)}
                    className="hit-y rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-50"
                  >
                    Tidy up
                  </button>
                  <button type="button" onClick={() => setPending(null)} className="hit-y px-2.5 text-xs text-muted">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {managing && pending === null && tidyResult && <p className="px-3 pt-1 text-[11px] leading-snug text-accent">{tidyResult}</p>}
            {managing && pending === null && tidyable && (
              <button
                type="button"
                onClick={() => {
                  setTidyResult(null);
                  setPending({ kind: "tidy" });
                }}
                className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
              >
                <Sparkles size={14} /> Tidy up
              </button>
            )}
            {managing && pending === null && (
              <p className="px-3 pb-1 pt-0.5 text-[11px] leading-snug text-muted-2">
                Rename, merge one session&apos;s solves into another ({nameOf(activeId ?? "")} stays open unless you merge it away), or delete
                one. Changes sync to your other devices.
              </p>
            )}
          </div>
        </>
      )}
      {compareOpen && <SessionCompareSheet onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
