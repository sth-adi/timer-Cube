"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bluetooth, Delete, GitBranch, Loader2, Navigation, RotateCcw } from "lucide-react";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { planNext } from "@/lib/satnav/client";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { inGrip } from "@/lib/xray/common";
import { applyTurns, completeFrom, msPerTurnAfter, originalRemainder, stateAt, verdict, type Completion } from "@/lib/smartcube/whatIf";
import { solveFinalMs } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const FACES = ["U", "D", "R", "L", "F", "B"] as const;
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const VALID = /^[URFDLBurfdlbMESxyz]w?['2]?$/;

/**
 * Time Machine's "what if": pick a saved smart-cube solve, fork it at any
 * turn, play something different — typed, tapped, or turned on your cube —
 * and the Sat-Nav finishes the solve from wherever your branch leaves it.
 * Branch vs. what you really did, in turns and in seconds at your pace.
 */
export function WhatIf() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const solves = useMemo(
    () => allSolves.filter((s) => s.scramble && s.reconstruction && s.moveTimestamps?.length).sort((a, b) => b.date - a.date),
    [allSolves],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const solve = solves.find((s) => s.id === pickedId) ?? solves[0] ?? null;
  const moves = useMemo(() => solve?.reconstruction?.split(/\s+/).filter(Boolean) ?? [], [solve]);
  const [at, setAt] = useState(0);
  const [branch, setBranch] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [fromCube, setFromCube] = useState(false);
  const [completion, setCompletion] = useState<{ key: string; result: Completion | null } | null>(null);
  const cubeConnected = useSmartCubeStore((s) => s.connected);
  const planId = useRef(0);

  const pick = (id: string) => {
    setPickedId(id);
    setAt(0);
    setBranch([]);
  };

  const fork = useMemo(() => (solve ? stateAt(solve.scramble, moves, at) : ""), [solve, moves, at]);
  const branchState = useMemo(() => (fork ? applyTurns(fork, branch) : ""), [fork, branch]);
  const key = `${solve?.id}|${at}|${branch.join(" ")}`;

  useEffect(() => {
    if (!branchState) return;
    const id = ++planId.current;
    const t = window.setTimeout(() => {
      completeFrom(branchState, planNext)
        .then((result) => id === planId.current && setCompletion({ key, result }))
        .catch(() => id === planId.current && setCompletion({ key, result: null }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [branchState, key]);

  // Your cube as the input device: every turn you make is added to the branch.
  useEffect(() => {
    if (!fromCube) return;
    return subscribeRawMoves((m) => setBranch((b) => [...b, m.token]));
  }, [fromCube]);

  if (!solve) {
    return <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on a connected smart cube and your solves show up here to branch.</div>;
  }

  const current = completion?.key === key ? completion.result : undefined;
  const original = originalRemainder(solve.moveTimestamps!, solve.timeMs, at);
  const pace = msPerTurnAfter(solve.moveTimestamps!, solve.timeMs, at);
  const branchTotal = current ? branch.length + current.turns : null;
  const v = branchTotal !== null && current?.solved ? verdict(original, branchTotal, pace) : null;
  const forkMs = at === 0 ? 0 : solve.moveTimestamps![at - 1];

  const addTyped = () => {
    const tokens = typed.split(/\s+/).filter(Boolean);
    if (!tokens.length || !tokens.every((t) => VALID.test(t))) return;
    setBranch((b) => [...b, ...toPhysicalTurns(tokens.join(" "), HOME_ORIENTATION).turns]);
    setTyped("");
  };
  const typedOk = typed.trim() === "" || typed.split(/\s+/).filter(Boolean).every((t) => VALID.test(t));

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {solves.slice(0, 40).map((s) => {
          const final = solveFinalMs(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={cn(
                "flex shrink-0 flex-col items-start rounded-lg px-2.5 py-1.5 text-left",
                s.id === solve.id ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-foreground",
              )}
            >
              <span className="tabular-timer text-xs font-semibold">{final === null ? "DNF" : formatTime(final)}</span>
              <span className={cn("text-[9px]", s.id === solve.id ? "text-accent-fg/80" : "text-muted-2")}>
                {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card flex flex-col gap-2 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <GitBranch size={14} className="text-accent" /> Fork at turn {at}
          </p>
          <p className="text-[11px] tabular-nums text-muted-2">
            {secs(forkMs)} into a {formatTime(solve.timeMs)}
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={moves.length}
          value={at}
          onChange={(e) => {
            setAt(Number(e.target.value));
            setBranch([]);
          }}
          className="w-full accent-[var(--accent)]"
          aria-label="Turn to fork the solve at"
        />
        <p className="font-mono text-[11px] leading-relaxed text-muted">
          <span className="text-foreground">{inGrip(moves.slice(0, at), HOME_ORIENTATION).join(" ")}</span>
          <span className="mx-1 rounded bg-accent px-1 text-accent-fg">⑂</span>
          <span className="text-muted-2 line-through decoration-muted-2/50">{inGrip(moves.slice(at), HOME_ORIENTATION).join(" ")}</span>
        </p>
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <p className="text-sm font-semibold text-foreground">Your branch</p>
        <div className="flex min-h-[32px] flex-wrap items-center gap-1 rounded-lg bg-bg-panel-2 p-2 font-mono text-sm">
          {branch.length === 0 ? (
            <span className="text-[11px] text-muted-2">No turns yet — the Sat-Nav finishes straight from the fork.</span>
          ) : (
            inGrip(branch, HOME_ORIENTATION).map((t, i) => (
              <span key={i} className="rounded bg-accent-soft px-1.5 font-bold text-accent">
                {t}
              </span>
            ))
          )}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {FACES.flatMap((f) => [f, `${f}'`, `${f}2`]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBranch((b) => [...b, ...toPhysicalTurns(t, HOME_ORIENTATION).turns])}
              className="rounded-md bg-bg-panel-2 py-1.5 font-mono text-xs font-bold text-foreground hover:bg-accent-soft"
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTyped()}
            placeholder="or type: R U R' U'"
            className={cn(
              "min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-3 py-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-2",
              !typedOk && "ring-1 ring-danger",
            )}
          />
          <button type="button" onClick={addTyped} disabled={!typedOk || !typed.trim()} className="rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-40">
            Add
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button type="button" onClick={() => setBranch((b) => b.slice(0, -1))} disabled={!branch.length} className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 font-medium text-muted disabled:opacity-40">
            <Delete size={11} /> Undo
          </button>
          <button type="button" onClick={() => setBranch([])} disabled={!branch.length} className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 font-medium text-muted disabled:opacity-40">
            <RotateCcw size={11} /> Clear
          </button>
          {cubeConnected && (
            <button
              type="button"
              onClick={() => setFromCube((v) => !v)}
              aria-pressed={fromCube}
              className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 font-medium", fromCube ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted")}
            >
              <Bluetooth size={11} /> {fromCube ? "Recording your turns" : "Turn it on my cube"}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-2">Notation is yellow on top, green in front.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card flex flex-col items-center gap-1.5 rounded-xl p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What you did</p>
          <div className="w-24">
            <FaceletNet facelets={fork} className="w-full" />
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{original.turns} turns</p>
          <p className="text-[11px] text-muted">{secs(original.ms)} from the fork</p>
        </div>
        <div className="card flex flex-col items-center gap-1.5 rounded-xl p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-accent">Branch</p>
          <div className="w-24">
            <FaceletNet facelets={branchState} className="w-full" />
          </div>
          {current === undefined ? (
            <Loader2 size={18} className="my-2 animate-spin text-accent" />
          ) : !current || !current.solved ? (
            <p className="py-2 text-center text-[11px] text-muted">The Sat-Nav couldn&apos;t finish this branch.</p>
          ) : (
            <>
              <p className="text-lg font-bold tabular-nums text-foreground">{branchTotal} turns</p>
              <p className="text-[11px] text-muted">
                ≈{secs(branchTotal! * pace)} at your pace
                {branch.length > 0 && ` · ${branch.length} yours + ${current.turns}`}
              </p>
            </>
          )}
        </div>
      </div>

      {v && (
        <p className={cn("rounded-xl px-3 py-2 text-center text-sm font-semibold", v.turnDelta < 0 ? "bg-success/15 text-success" : v.turnDelta > 0 ? "bg-danger/10 text-danger" : "bg-bg-panel-2 text-foreground")}>
          {v.line}
        </p>
      )}

      {current?.solved && current.legs.length > 0 && (
        <div className="card flex flex-col gap-2 rounded-xl p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
            <Navigation size={11} className="text-accent" /> How the Sat-Nav finishes {branch.length ? "your branch" : "from the fork"}
          </p>
          {current.legs.map((l, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="text-[11px] font-semibold text-foreground">{l.title}</p>
              <p className="font-mono text-[11px] text-muted">{l.display.join(" ")}</p>
            </div>
          ))}
          <p className="text-[10px] text-muted-2">
            Seconds are an estimate: branch turns priced at your own pace after the fork ({Math.round(pace)}ms a turn, pauses included).
          </p>
        </div>
      )}
    </div>
  );
}
