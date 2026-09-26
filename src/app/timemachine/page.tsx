"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, GitBranch, History, Loader2, Rewind, Sparkles, Timer as TimerIcon, Undo2, X } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { WhatIf } from "@/components/timemachine/WhatIf";
import { cn } from "@/lib/utils/cn";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { buildMoments, getTimeMachineLog, sequenceTo, subscribeTimeMachine, undoRoute, type Moment } from "@/lib/smartcube/timeMachine";
import { RouteTracker } from "@/lib/smartcube/route";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";

/** Beyond this many turns, the literal undo is worth replacing with a solver-found shortest route. */
const SHORTEST_ROUTE_THRESHOLD = 12;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

interface Rewind {
  target: Moment;
  route: string[];
  position: number;
  partial: boolean;
  /** "undo" = literally reversing your turns; "shortest" = solver route between the two states. */
  kind: "undo" | "shortest";
  finding: boolean;
  arrived: boolean;
}

function TimeMachine() {
  const log = useSyncExternalStore(subscribeTimeMachine, getTimeMachineLog, getTimeMachineLog);
  const moments = useMemo(() => buildMoments(log), [log]);
  const [rewind, setRewind] = useState<Rewind | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const trackerRef = useRef<RouteTracker | null>(null);
  const rewindRef = useRef<Rewind | null>(null);
  const searchRef = useRef(0);
  useEffect(() => {
    rewindRef.current = rewind;
  }, [rewind]);

  /** Plans (or re-plans, after a stray turn) the way back to `target` from wherever the cube is now. */
  const plan = useCallback((target: Moment) => {
    const current = getTimeMachineLog();
    const undo = undoRoute(current, target.count);
    trackerRef.current = new RouteTracker(undo);
    const live = useSmartCubeStore.getState().liveFacelets;
    const arrived = live === target.facelets;
    setRewind({ target, route: undo, position: 0, partial: false, kind: "undo", finding: !arrived && undo.length > SHORTEST_ROUTE_THRESHOLD, arrived });
    if (arrived || undo.length <= SHORTEST_ROUTE_THRESHOLD) return;
    // A long way back: ask the solver for the shortest route between the two states.
    const id = ++searchRef.current;
    getCubeEngineClient()
      .computeCorrectiveMoves(sequenceTo(current, target.count), live)
      .then((shortest) => {
        if (id !== searchRef.current || rewindRef.current?.target !== target) return;
        if (shortest.length < undo.length && (rewindRef.current?.position ?? 0) === 0) {
          trackerRef.current = new RouteTracker(shortest);
          setRewind((r) => (r ? { ...r, route: shortest, kind: "shortest", finding: false } : r));
        } else {
          setRewind((r) => (r ? { ...r, finding: false } : r));
        }
      })
      .catch(() => setRewind((r) => (r ? { ...r, finding: false } : r)));
  }, []);

  useEffect(() => {
    return subscribeRawMoves((move) => {
      const r = rewindRef.current;
      const tracker = trackerRef.current;
      if (!r || r.arrived || !tracker) return;
      const event = tracker.push(move.token);
      // Read the live state once the store has applied this turn.
      window.setTimeout(() => {
        const current = rewindRef.current;
        if (!current || current.target !== r.target) return;
        if (useSmartCubeStore.getState().liveFacelets === r.target.facelets) {
          trackerRef.current = null;
          setRewind({ ...current, position: current.route.length, arrived: true, finding: false });
          return;
        }
        if (event === "off-route") plan(r.target);
        else setRewind({ ...current, position: tracker.position, partial: tracker.partial });
      }, 0);
    });
  }, [plan]);

  const reversed = [...moments].reverse();
  const scrubCount = scrub ?? log.length;
  const scrubFacelets = useMemo(() => {
    // Only replayed while scrubbing; moments already carry their facelets.
    const m = moments.find((x) => x.count === scrubCount);
    if (m) return m.facelets;
    return null;
  }, [moments, scrubCount]);

  if (rewind) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="card flex w-full flex-col items-center gap-3 rounded-xl p-4 text-center">
          <div className="flex w-full items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Rewind size={15} className="text-accent" /> Rewinding to {rewind.target.count === 0 ? "when you connected" : timeAgo(rewind.target.wallMs)}
            </p>
            <button type="button" onClick={() => setRewind(null)} className="text-muted-2 hover:text-foreground" aria-label="Cancel rewind">
              <X size={16} />
            </button>
          </div>
          <div className="w-40">
            <FaceletNet facelets={rewind.target.facelets} className="w-full" />
          </div>
          {rewind.arrived ? (
            <p className="flex items-center gap-1.5 py-2 text-base font-bold text-success">
              <CheckCircle2 size={18} /> You&apos;re back.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted">
                {rewind.route.length} turn{rewind.route.length === 1 ? "" : "s"} ·{" "}
                {rewind.kind === "shortest" ? (
                  <span className="text-accent">shortest route between the two states</span>
                ) : (
                  "your own turns, undone"
                )}
                {rewind.finding && (
                  <span className="ml-1 inline-flex items-center gap-1 text-muted-2">
                    <Loader2 size={10} className="animate-spin" /> looking for a shorter way
                  </span>
                )}
              </p>
              <RouteChips display={rewind.route} turns={rewind.route} position={rewind.position} partial={rewind.partial} variant="color" />
              <p className="text-[10px] text-muted-2">Each square is the center to turn — ↻ clockwise looking at that face, ↺ counter-clockwise.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Scrub your history</p>
          <p className="text-[11px] tabular-nums text-muted-2">
            turn {scrubCount} of {log.length}
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, log.length)}
          value={scrubCount}
          onChange={(e) => setScrub(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
          aria-label="Pick a point in your cube's history"
        />
        <div className="flex items-center gap-3">
          <div className="w-32 shrink-0">
            <ScrubPreview count={scrubCount} fallback={scrubFacelets} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="text-[11px] text-muted">
              {scrubCount === log.length ? "Right now" : `${log.length - scrubCount} turns ago`}
            </p>
            <button
              type="button"
              disabled={scrubCount === log.length}
              onClick={() => plan(momentAt(log, scrubCount))}
              className="flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
            >
              <Undo2 size={12} /> Rewind to here
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => plan(moments[0])}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent"
      >
        <Sparkles size={14} /> Take me back to solved
      </button>

      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">Moments</p>
        {reversed.length <= 1 && <p className="px-1 text-xs text-muted">Turn the cube — every pause becomes a moment you can jump back to.</p>}
        {reversed.slice(0, 60).map((m) => (
          <button
            key={m.count}
            type="button"
            onClick={() => plan(m)}
            disabled={m.count === log.length}
            className="flex items-center gap-3 rounded-xl bg-bg-panel-2 px-3 py-2 text-left transition-colors hover:bg-bg-panel-2/70 disabled:opacity-60"
          >
            <div className="w-16 shrink-0">
              <FaceletNet facelets={m.facelets} className="w-full" />
            </div>
            <div className="flex flex-1 flex-col">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {m.count === log.length ? "Now" : m.count === 0 ? "Connected" : timeAgo(m.wallMs)}
                {m.solved && <span className="rounded-full bg-success/15 px-1.5 py-px text-[9px] font-medium text-success">solved</span>}
              </span>
              <span className="text-[10px] text-muted-2">
                {m.count === 0 ? "the state you connected in" : `${m.burstTurns} turns in ${(m.burstMs / 1000).toFixed(1)}s · ${log.length - m.count} turns ago`}
              </span>
            </div>
            {m.count !== log.length && <Rewind size={14} className="shrink-0 text-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A synthetic moment for any turn index (not just the end of a burst). */
function momentAt(log: ReturnType<typeof getTimeMachineLog>, count: number): Moment {
  const facelets = replayFacelets(sequenceTo(log, count));
  return { count, wallMs: log[count - 1]?.wallMs ?? log[0]?.wallMs ?? Date.now(), burstTurns: 0, burstMs: 0, solved: false, facelets };
}

/** Replays a turn sequence from solved to its facelets, memoised — scrubbing asks for the same points over and over. */
const faceletCache = new Map<string, string>();
function replayFacelets(seq: string): string {
  let f = faceletCache.get(seq);
  if (!f) {
    f = scrambleToFacelets(seq);
    if (faceletCache.size > 200) faceletCache.clear();
    faceletCache.set(seq, f);
  }
  return f;
}

function ScrubPreview({ count, fallback }: { count: number; fallback: string | null }) {
  const log = getTimeMachineLog();
  const facelets = fallback ?? replayFacelets(sequenceTo(log, count));
  return <FaceletNet facelets={facelets} className="w-full" />;
}

/**
 * Cube Time Machine: an undo button for a physical cube. Every turn since
 * connecting is on the timeline; pick any moment — the end of a solve, the
 * scramble you were halfway through, the position before you tried that alg
 * — and it gives you the way back, ticking turns off live (and, for a long
 * way back, swapping your literal undo for the shortest route between the
 * two states).
 */
export default function TimeMachinePage() {
  const [tab, setTab] = useState<"rewind" | "whatif">("rewind");
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
              <History size={17} className="text-accent" /> Cube Time Machine
            </h1>
            <p className="text-[11px] text-muted-2">
              An undo button for your physical cube — and a what-if lab for any solve you&apos;ve saved: fork it, play it differently, see how it
              ends.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1">
            {(
              [
                ["rewind", "Rewind my cube", Rewind],
                ["whatif", "What if?", GitBranch],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold",
                  tab === id ? "bg-accent text-accent-fg" : "text-muted",
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          {tab === "rewind" ? (
            <ConnectGate blurb="The Time Machine records every turn your smart cube makes, so it needs one connected.">
              <TimeMachine />
            </ConnectGate>
          ) : (
            <WhatIf />
          )}
        </div>
      </div>
    </>
  );
}
