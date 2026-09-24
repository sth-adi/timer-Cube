"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, BellOff, Moon } from "lucide-react";
import { PlayShell, TurnPad } from "@/components/play/PlayShell";
import { usePlayInput, physicalFromGrip } from "@/lib/play/usePlayInput";
import { alarmVolume, nextRing, untilLabel, wakeScramble } from "@/lib/play/wake";
import { ScrambleGuide, type GuideView } from "@/lib/smartcube/scrambleGuide";
import { HOME_ORIENTATION, viewerMove } from "@/lib/gyro/orientation";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { useStored } from "@/lib/play/useStored";

const ACCENT = "#ff7a45";
const SETTINGS_KEY = "wake-alarm";
const LOG_KEY = "wake-log";
/** Turns you must make after the scramble before a solved cube counts — undoing the scramble by rote is still a solve, but not zero effort. */
const MIN_SOLVE_TURNS = 8;
const PANIC_HOLD_MS = 8000;

type Phase = "idle" | "armed" | "scramble" | "solve" | "done";

interface WakeEntry {
  at: number;
  /** From ringing to solved. */
  totalMs: number;
  solveMs: number;
}

const NO_LOG: WakeEntry[] = [];

const toGrip = (physical: string) => viewerMove(physical, HOME_ORIENTATION);

/** The siren: two-tone pulses whose volume climbs the longer it rings. */
class Siren {
  private ctx: AudioContext | null = null;
  private timer = 0;
  private startedAt = 0;

  /** Must be called from a tap, so the browser lets it make sound hours later. */
  prime() {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
  }

  start() {
    this.prime();
    this.stop();
    this.startedAt = performance.now();
    const beep = () => {
      const ctx = this.ctx!;
      const vol = alarmVolume(performance.now() - this.startedAt);
      [0, 0.18, 0.36].forEach((offset, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = i === 1 ? 1320 : 880;
        const t = ctx.currentTime + offset;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.01);
        g.gain.linearRampToValueAtTime(0, t + 0.14);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.16);
      });
      navigator.vibrate?.([400, 200, 400]);
    };
    beep();
    this.timer = window.setInterval(beep, 1100);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
  }
}

/**
 * Wake Solve: an alarm that won't stop until you scramble your cube (as it
 * tells you, turn by turn, with the same guide the timer uses) and then
 * solve it. By the time it's quiet, you're awake. It has to stay open —
 * browsers can't wake a closed tab — so it holds the screen on while armed.
 */
export default function WakePage() {
  const [time, setTime] = useStored<string>(SETTINGS_KEY, "07:00");
  const [phase, setPhase] = useState<Phase>("idle");
  const [ringAt, setRingAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<GuideView | null>(null);
  const [solveTurns, setSolveTurns] = useState(0);
  const [log, setLog] = useStored<WakeEntry[]>(LOG_KEY, NO_LOG);
  const [result, setResult] = useState<WakeEntry | null>(null);
  const [panic, setPanic] = useState(0);
  const [solveStartAt, setSolveStartAt] = useState<number | null>(null);
  const siren = useRef<Siren | null>(null);
  const guide = useRef<ScrambleGuide | null>(null);
  const rangAt = useRef(0);
  const solveStart = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  const logRef = useRef(log);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    logRef.current = log;
  }, [phase, log]);


  const { facelets, press, connected, resetVirtual } = usePlayInput((t) => {
    const p = phaseRef.current;
    if (p === "scramble" && guide.current) {
      const v = guide.current.push(t.physical);
      setView(v);
      // Wandered far off the scramble: it's scrambled enough — go straight to solving.
      if (v.done || guide.current.offBy > 6) {
        setPhase("solve");
        solveStart.current = null;
        setSolveStartAt(null);
        setSolveTurns(0);
      }
    } else if (p === "solve") {
      if (solveStart.current === null) {
        solveStart.current = Date.now();
        setSolveStartAt(solveStart.current);
      }
      setSolveTurns((n) => n + 1);
    }
  });

  const finish = useCallback(() => {
    siren.current?.stop();
    const total = Date.now() - rangAt.current;
    const solveMs = solveStart.current ? Date.now() - solveStart.current : 0;
    const entry = { at: rangAt.current, totalMs: total, solveMs };
    setResult(entry);
    setLog([entry, ...logRef.current].slice(0, 30));
    setPhase("done");
    void lock.current?.release().catch(() => {});
    lock.current = null;
  }, [setLog]);

  // Solved (after real effort) → silence.
  useEffect(() => {
    if (phase === "solve" && facelets === SOLVED_FACELETS && solveTurns >= MIN_SOLVE_TURNS) finish();
  }, [phase, facelets, solveTurns, finish]);

  const ring = useCallback(() => {
    rangAt.current = Date.now();
    siren.current ??= new Siren();
    siren.current.start();
    setRingAt(null);
    // A cube that's already scrambled only needs solving.
    const solvedNow = facelets === SOLVED_FACELETS;
    if (solvedNow) {
      const steps = wakeScramble(connected ? 14 : 8).map((g) => physicalFromGrip(g, HOME_ORIENTATION));
      guide.current = new ScrambleGuide(steps);
      setView(guide.current.view());
      setPhase("scramble");
    } else {
      setPhase("solve");
    }
    solveStart.current = null;
    setSolveStartAt(null);
    setSolveTurns(0);
  }, [facelets, connected]);

  // The clock.
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (phaseRef.current === "armed" && ringAt && n >= ringAt) ring();
    }, 250);
    return () => window.clearInterval(t);
  }, [ringAt, ring]);

  const holdScreen = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      lock.current = (await wl?.request("screen")) ?? null;
    } catch {
      lock.current = null;
    }
  };
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && phaseRef.current === "armed") void holdScreen();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const arm = (inMs?: number) => {
    siren.current ??= new Siren();
    siren.current.prime();
    const at = inMs ? Date.now() + inMs : nextRing(time, new Date()).getTime();
    setRingAt(at);
    setPhase("armed");
    setResult(null);
    void holdScreen();
  };

  const disarm = () => {
    setRingAt(null);
    setPhase("idle");
    void lock.current?.release().catch(() => {});
    lock.current = null;
  };

  // Emergency stop: hold for PANIC_HOLD_MS (a dead cube battery shouldn't mean a siren forever).
  const panicTimer = useRef(0);
  const panicStart = () => {
    const t0 = performance.now();
    panicTimer.current = window.setInterval(() => {
      const p = (performance.now() - t0) / PANIC_HOLD_MS;
      setPanic(p);
      if (p >= 1) {
        window.clearInterval(panicTimer.current);
        setPanic(0);
        finish();
      }
    }, 50);
  };
  const panicEnd = () => {
    window.clearInterval(panicTimer.current);
    setPanic(0);
  };

  const ringing = phase === "scramble" || phase === "solve";

  if (ringing)
    return (
      <div className="play-root play-alarm fixed inset-0 z-50 overflow-y-auto" style={{ ["--play-accent" as string]: ACCENT }}>
        <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center gap-5 px-4 py-8 text-center">
          <AlarmClock size={44} className="play-pulse text-[var(--play-accent)]" />
          <p className="text-[12px] font-bold uppercase tracking-[0.35em] text-[var(--play-accent)]">{phase === "scramble" ? "Step 1 · Scramble" : "Step 2 · Solve"}</p>
          {phase === "scramble" && view ? (
            <>
              <p className="text-2xl font-black">Scramble your cube</p>
              <p className="text-[12px] text-white/70">Yellow top, green front. Follow along — it tracks every turn.</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {view.steps.map((s, i) => (
                  <span
                    key={i}
                    className={cn(
                      "min-w-[2.6rem] rounded-lg px-2 py-1.5 font-mono text-lg font-bold",
                      i < view.index ? "bg-white/5 text-white/25" : i === view.index ? "bg-[var(--play-accent)] text-black play-glow" : "bg-white/10 text-white",
                    )}
                  >
                    {toGrip(s)}
                  </span>
                ))}
              </div>
              {view.undo.length > 0 && (
                <div className="rounded-xl bg-red-500/20 px-4 py-2 text-sm">
                  Off track — undo: <span className="font-mono font-bold">{view.undo.map(toGrip).join(" ")}</span>
                  {view.fix && (
                    <>
                      {" "}
                      or just <span className="font-mono font-bold">{toGrip(view.fix)}</span>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-2xl font-black">Now solve it</p>
              <p className="text-[12px] text-white/70">The alarm stops the moment the cube is solved.</p>
              <p className="text-5xl font-black tabular-nums">{solveStartAt ? formatTime(Math.max(0, now - solveStartAt)) : "0.00"}</p>
              <p className="text-[12px] text-white/60">{solveTurns} turns</p>
            </>
          )}
          {!connected && <TurnPad onTurn={press} className="w-full" />}
          <div className="mt-auto flex w-full flex-col items-center gap-1 pt-6">
            <button
              type="button"
              onPointerDown={panicStart}
              onPointerUp={panicEnd}
              onPointerLeave={panicEnd}
              className="relative overflow-hidden rounded-full border border-white/20 px-4 py-2 text-[11px] text-white/60"
            >
              <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${panic * 100}%` }} />
              <span className="relative flex items-center gap-1.5">
                <BellOff size={12} /> Cube dead? Hold {PANIC_HOLD_MS / 1000}s to stop
              </span>
            </button>
            {!connected && (
              <button type="button" onClick={() => resetVirtual()} className="text-[10px] text-white/30 underline">
                reset on-screen cube
              </button>
            )}
          </div>
        </div>
      </div>
    );

  const until = ringAt ? ringAt - now : 0;
  const avgSolve = log.length ? log.reduce((a, e) => a + e.solveMs, 0) / log.length : 0;

  return (
    <PlayShell accent={ACCENT} title="Wake Solve" tagline="An alarm that only stops once you've scrambled your cube and solved it. By the time it's quiet, you're awake.">
      {phase === "done" && result && (
        <div className="play-panel play-glow flex flex-col items-center gap-1 rounded-2xl p-5 text-center animate-fade-in-up">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--play-accent)]">Good morning</p>
          <p className="text-4xl font-black tabular-nums">{result.solveMs ? formatTime(result.solveMs) : "—"}</p>
          <p className="text-[12px] text-[var(--play-dim)]">
            morning solve · {Math.round(result.totalMs / 1000)}s from first ring to silence
            {avgSolve && log.length > 1 ? ` · your wake-up average ${formatTime(avgSolve)}` : ""}
          </p>
        </div>
      )}

      <div className="play-panel flex flex-col items-center gap-4 rounded-2xl p-5">
        {phase === "armed" ? (
          <>
            <Moon size={28} className="text-[var(--play-accent)]" />
            <p className="text-6xl font-black tabular-nums tracking-tight">{time}</p>
            <p className="text-sm text-[var(--play-dim)]">rings in {untilLabel(until)}</p>
            <p className="max-w-xs text-center text-[11px] leading-snug text-[var(--play-dim)]">
              Leave this page open and the phone plugged in, volume up. The screen stays on while it&apos;s armed. {connected ? "Keep the cube connected and solved." : "No cube connected — you'll scramble and solve the on-screen one."}
            </p>
            <button type="button" onClick={disarm} className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold">
              Turn off
            </button>
          </>
        ) : (
          <>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-center text-5xl font-black tabular-nums text-white outline-none [color-scheme:dark] focus:border-[var(--play-accent)]"
            />
            <button type="button" onClick={() => arm()} className="play-btn play-glow flex items-center gap-2 px-8 py-3 text-base">
              <AlarmClock size={18} /> Arm alarm
            </button>
            <button type="button" onClick={() => arm(5000)} className="text-[12px] font-semibold text-[var(--play-dim)] underline underline-offset-4">
              Try it — ring in 5 seconds
            </button>
          </>
        )}
      </div>

      <div className="play-panel flex flex-col gap-2 rounded-2xl p-4 text-[12px] leading-snug text-[var(--play-dim)]">
        <p>
          <b className="text-white">How it stops:</b> it shows a scramble and follows your cube turn by turn (wrong turns get an undo). Then you solve. Solved = silence. {!connected && "Connect a smart cube before bed for the real thing."}
        </p>
        <p>If the cube is already scrambled when it rings, you skip straight to solving.</p>
      </div>

      {log.length > 0 && (
        <div className="play-panel flex flex-col gap-2 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--play-dim)]">Morning log</p>
          {log.slice(0, 7).map((e) => (
            <div key={e.at} className="flex items-center justify-between text-[12px]">
              <span className="text-[var(--play-dim)]">{new Date(e.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
              <span className="font-bold tabular-nums">{e.solveMs ? formatTime(e.solveMs) : "stopped"}</span>
            </div>
          ))}
        </div>
      )}
    </PlayShell>
  );
}
