"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Clapperboard, Clock, Gauge, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { CAMERA_LATITUDE, CAMERA_LONGITUDE, loadCubing } from "@/components/scramble/CubeViewer";
import { recolorPlayer } from "@/components/scramble/cubeColors";
import { CubeStage, ReplayControlsSkeleton } from "@/components/lab/CubeStage";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/time";
import { readingMs, type Cue } from "@/lib/replay/directorsCut";
import { buildPaceCurve } from "@/lib/analysis/paceCurve";
import { buildLeanTurns } from "@/lib/analysis/replayCamera";
import {
  SNAP_TURN_MS,
  TURN_MS,
  activeLeaf,
  buildTimeline,
  markSegments,
  remapPosition,
  type PhaseMark,
  type ReplayTimeline,
} from "@/lib/analysis/replayTiming";
import { ReplayGhostTwin } from "./ReplayGhostTwin";
import { ReplayPaceCurve } from "./ReplayPaceCurve";
import { REPLAY_LATITUDE_LIMIT, useReplayCamera, type ReplayCameraGyro } from "./useReplayCamera";
import { useReplayGhostControl, type ReplayGhostOption } from "./useReplayGhost";

interface TimedCubePlayerProps {
  /** The alg that plays on the player's own timeline. */
  alg: string;
  /** Moves applied silently to establish the starting position before `alg` plays. */
  setupAlg?: string;
  /**
   * Real (or fallback) elapsed ms for each move in `alg`, one entry per move,
   * in order. Authored onto the player's own timeline (see below) rather than
   * driving playback ourselves, so play/pause/scrub still work through the
   * player's own real API — they just pace against how long each move
   * actually took.
   */
  gapsMs: number[];
  /** Whether `gapsMs` is real capture timing (vs. a level fallback pace) — only changes the badge text below the controls. */
  hasRealTiming: boolean;
  /** Applied to the cube viewport itself, not the controls beneath it. */
  className?: string;
  /**
   * Director's Cut: commentary cues keyed to move indices in `alg`. Playback
   * holds on each one while it's read out (spoken when `voice` is on), then
   * carries on by itself.
   */
  cues?: Cue[];
  voice?: boolean;
  /**
   * Where each CFOP phase ends, as a count of `alg`'s moves (see
   * lib/analysis/replayTiming.ts) — drawn as ticks on the scrubber, with the
   * phase names under it. Omit for no ticks.
   */
  marks?: PhaseMark[];
  /**
   * Draws the move text under the controls. Gets the index of the move that
   * is playing (or last played) in `alg`, -1 before the first one starts, so
   * the caller can light it up in whatever form it displays the moves.
   */
  renderMoves?: (activeMove: number) => ReactNode;
  /**
   * Drawn over the corner of the cube viewport, from where the replay is right now: `positionMs`
   * on the replay's own clock, `activeMove` as for `renderMoves`, and the `timeline` those are
   * measured on. Doesn't take pointer input, so the cube still orbits underneath.
   */
  overlay?: (at: { positionMs: number; activeMove: number; timeline: ReplayTimeline; playing: boolean; speed: number }) => ReactNode;
  /**
   * A second, faint cube to race beside yours (your best earlier solve, or a model solution), switched
   * on with a "vs PB" toggle under the controls. Off until asked for; no toggle without one.
   */
  ghost?: ReplayGhostOption | null;
  /**
   * The solve's recorded cube orientation: the replay's camera then follows its tilt a little, on top of
   * leaning toward the face being turned. `moveMs` is when each of `alg`'s moves was really made.
   */
  gyro?: ReplayCameraGyro | null;
}

const CUE_TONE: Record<Cue["tone"], string> = { good: "text-success", bad: "text-danger", neutral: "text-accent" };

function speak(line: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    // Never hang on a voice that doesn't report back: the reading time (doubled) is the ceiling.
    const safety = window.setTimeout(resolve, synth ? readingMs(line) * 2 : readingMs(line));
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.05;
    u.onend = u.onerror = () => {
      window.clearTimeout(safety);
      resolve();
    };
    synth.speak(u);
  });
}

const SPEEDS = [0.5, 1, 2, 4] as const;
/** Slider thumb width the tick marks are inset by, so they line up with where the thumb actually stops. */
const THUMB_PX = 16;
/** Sticker size relative to its cubie (cubing.js defaults to 0.85). */
const FACELET_SCALE = 0.8;
const REAL_PAUSES_KEY = "replay-real-pauses";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readRealPauses(): boolean {
  try {
    return localStorage.getItem(REAL_PAUSES_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRealPauses(on: boolean) {
  try {
    localStorage.setItem(REAL_PAUSES_KEY, on ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the choice just doesn't outlive this view.
  }
}
/** How often to read the player's own timeline position while playing, to keep the scrubber in sync. */
const POLL_MS = 80;

/** One animation leaf per move, placed on `timeline` — the shape animationTimelineLeavesRequest wants. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leavesFor(leafMoves: any[], timeline: ReplayTimeline) {
  return leafMoves.map((move, i) => ({ animLeaf: move, start: timeline.starts[i], end: timeline.ends[i] }));
}

/**
 * A 3D cube whose playback timeline is authored move-by-move from real
 * capture data, using cubing.js's own `animationTimelineLeavesRequest` API —
 * the same mechanism the library's own docs use for custom per-move timing.
 * Play/pause/scrub are driven through the player's real public API
 * (`play()`, `pause()`, the `timestamp` setter), not simulated by swapping
 * `alg` in and out — that doesn't animate anything on its own.
 */
export function TimedCubePlayer({ alg, setupAlg, gapsMs, hasRealTiming, className, cues, voice = true, marks, renderMoves, overlay, ghost, gyro }: TimedCubePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  // cubing.js (or the player) failed to load: the stage says so and offers a Retry instead of an empty box.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Both timings are laid out once, from the gaps this player was mounted with
  // (see the init effect): the default one with idle pauses capped, and the
  // true one. Turns snap under prefers-reduced-motion.
  const [timelines] = useState(() => {
    const turnMs = prefersReducedMotion() ? SNAP_TURN_MS : TURN_MS;
    return {
      capped: buildTimeline(gapsMs, { realPauses: false, turnMs }),
      real: buildTimeline(gapsMs, { realPauses: true, turnMs }),
      turnMs,
    };
  });
  const [realPauses, setRealPauses] = useState(() => hasRealTiming && readRealPauses());
  const timeline: ReplayTimeline = realPauses ? timelines.real : timelines.capped;
  // False when `alg` and `gapsMs` don't line up move for move: nothing plays then.
  const [timelineOk, setTimelineOk] = useState(false);
  const durationMs = timelineOk ? timeline.durationMs : 0;
  // The toggle only means something when capping actually shortened the replay.
  const canToggleRealPauses = hasRealTiming && timelineOk && timelines.real.durationMs - timelines.capped.durationMs >= 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafMovesRef = useRef<any[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [soundOn, setSoundOn] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioCtxRef = useRef<any>(null);
  const leafStartsRef = useRef<number[]>(realPauses ? timelines.real.starts : timelines.capped.starts);
  const lastPolledPosRef = useRef(0);
  const [caption, setCaption] = useState<Cue | null>(null);
  const firedRef = useRef(new Set<number>());
  const holdRef = useRef<number | null>(null);
  // The poll loop reads the cue helpers through this ref so it always sees the current cues.
  const directorRef = useRef<{ dueCue: (prev: number, t: number) => Cue | null; hold: (cue: Cue) => void }>({ dueCue: () => null, hold: () => {} });
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const initialTimeline = realPauses ? timelines.real : timelines.capped;
    (async () => {
      let loaded: Awaited<ReturnType<typeof loadCubing>>;
      let player: InstanceType<(typeof import("cubing/twisty"))["TwistyPlayer"]>;
      try {
        loaded = await loadCubing();
        if (cancelled || !container) return;
        player = new loaded.twisty.TwistyPlayer({
          puzzle: "3x3x3",
          experimentalSetupAlg: setupAlg,
          background: "none",
          controlPanel: "none",
          hintFacelets: "none",
          experimentalDragInput: "auto",
          // Slightly smaller stickers leave more of the black cubie body showing between them: closer to
          // the beveled Gyro Twin than cubing.js's near-flush default (0.85).
          experimentalFaceletScale: FACELET_SCALE,
          // Room for the camera to lean either side of the resting view (see useReplayCamera).
          cameraLatitudeLimit: REPLAY_LATITUDE_LIMIT,
          cameraLatitude: CAMERA_LATITUDE,
          cameraLongitude: CAMERA_LONGITUDE,
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
        return;
      }
      const { Alg } = loaded.alg;
      player.style.width = "100%";
      player.style.height = "100%";
      // See CubeViewer.tsx's CAMERA_LATITUDE doc comment: this camera+flip
      // pair is what puts yellow (D) on top instead of cubing.js's default
      // white (U), and has to be a real 180° rotation (not a mirror) to
      // keep the cube's turns looking correctly handed.
      player.style.transform = "rotate(180deg)";
      // See CubeViewer.tsx's matching comment: without this, the player's
      // drag-to-orbit handler preventDefault()s every pointerdown and blocks
      // the page/pane from scrolling past it on a touchscreen. Restricting
      // to vertical panning lets a mostly-vertical touch scroll normally
      // while a mostly-horizontal drag still orbits the camera.
      player.style.touchAction = "pan-y";
      container.appendChild(player);
      playerRef.current = player;
      // Same sticker colours and solid body as the twin, the nets and the trainer's cube.
      void recolorPlayer(player);

      // Assigned after mount (mirrors cubing.js's own documented pattern for
      // animationTimelineLeavesRequest) so the leaves below are guaranteed to
      // describe the exact alg the player just parsed.
      player.alg = alg;

      const leafMoves = [...Alg.fromString(alg).experimentalLeafMoves()];
      const ok = leafMoves.length > 0 && leafMoves.length === gapsMs.length;
      if (ok) {
        leafMovesRef.current = leafMoves;
        // `MillisecondTimestamp` is a branded number type cubing.js doesn't
        // export, so a plain number literal can't satisfy it structurally —
        // cast at this one boundary rather than fighting the brand.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        player.experimentalModel.animationTimelineLeavesRequest.set(leavesFor(leafMoves, initialTimeline) as any);
      }
      if (!cancelled) {
        setTimelineOk(ok);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (playerRef.current && container?.contains(playerRef.current)) {
        container.removeChild(playerRef.current);
      }
      playerRef.current = null;
    };
    // alg/setupAlg/gapsMs are only meaningful together at construction time —
    // the parent remounts this component (via a `key`) on phase change.
    // Only the timing mode is re-authored on a live player (onToggleRealPauses).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.tempoScale = speed;
  }, [speed]);

  useEffect(
    () => () => {
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    },
    [],
  );

  // A short percussive tick for one move — cheap synthesis (no audio file),
  // fired from the poll loop below rather than scheduled in advance on the
  // AudioContext's own clock, so it stays correct through pausing, seeking,
  // and speed changes for free instead of needing to re-derive a schedule
  // for each.
  const playClick = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 950;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.035);
  };

  // Polls the player's own timeline position while playing, so the scrubber
  // tracks native playback instead of a second clock of our own that could
  // drift from it. Self-rescheduling (like the rest of this codebase's
  // timers) — setState only ever happens inside the async tick, never
  // synchronously during the effect itself.
  useEffect(() => {
    if (!playing) return undefined;
    let cancelled = false;
    let timer: number;
    const tick = async () => {
      const t: unknown = await playerRef.current?.experimentalGet.timestamp();
      if (cancelled) return;
      if (holdRef.current !== null) {
        timer = window.setTimeout(tick, POLL_MS);
        return;
      }
      if (typeof t === "number") {
        const cue = directorRef.current.dueCue(lastPolledPosRef.current, t);
        if (cue) {
          lastPolledPosRef.current = t;
          setPositionMs(t);
          directorRef.current.hold(cue);
          timer = window.setTimeout(tick, POLL_MS);
          return;
        }
        if (soundOn) {
          const prev = lastPolledPosRef.current;
          for (const start of leafStartsRef.current) {
            if (start > prev && start <= t) playClick();
          }
        }
        lastPolledPosRef.current = t;
        setPositionMs(t);
        if (durationMs > 0 && t >= durationMs - 1) {
          setPlaying(false);
          return;
        }
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [playing, durationMs, soundOn]);

  const atEnd = durationMs > 0 && positionMs >= durationMs - 1;

  /** The first not-yet-read cue whose move starts in (prev, t] — or at the very start. */
  function dueCue(prev: number, t: number): Cue | null {
    if (!cues?.length) return null;
    const starts = leafStartsRef.current;
    for (const c of cues) {
      if (firedRef.current.has(c.moveIndex)) continue;
      const at = starts[c.moveIndex];
      if (at === undefined) continue;
      if ((at > prev || (prev === 0 && at === 0)) && at <= t) return c;
    }
    return null;
  }

  /** Pause on a cue, read it, then carry on — unless they pressed pause meanwhile. */
  function hold(cue: Cue) {
    const player = playerRef.current;
    firedRef.current.add(cue.moveIndex);
    setCaption(cue);
    player?.pause();
    const token = cue.moveIndex;
    holdRef.current = token;
    const done = voiceRef.current ? speak(cue.line) : new Promise<void>((r) => window.setTimeout(r, readingMs(cue.line)));
    void done.then(() => {
      if (holdRef.current !== token) return;
      holdRef.current = null;
      playerRef.current?.play();
    });
  }

  useEffect(() => {
    directorRef.current = { dueCue, hold };
  });

  const stopHold = () => {
    holdRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  };

  /** Cues before `pos` count as already read (after a scrub or restart). */
  const resetCues = (pos: number) => {
    const starts = leafStartsRef.current;
    firedRef.current = new Set((cues ?? []).filter((c) => (starts[c.moveIndex] ?? 0) < pos).map((c) => c.moveIndex));
  };

  useEffect(() => () => void (typeof window !== "undefined" && window.speechSynthesis?.cancel()), []);

  const onPlayPause = () => {
    const player = playerRef.current;
    if (!player || durationMs === 0) return;
    if (playing) {
      stopHold();
      player.pause();
      setPlaying(false);
      return;
    }
    if (atEnd) {
      player.timestamp = 0;
      setPositionMs(0);
      lastPolledPosRef.current = 0;
      resetCues(0);
      setCaption(null);
    }
    // A cue on the very first move is read before anything turns.
    const first = lastPolledPosRef.current === 0 ? dueCue(0, 0) : null;
    setPlaying(true);
    if (first) hold(first);
    else player.play();
  };

  // Space plays/pauses while the replay sits in a dialog (the instant-replay
  // sheet). Anywhere else it's left to the page, where it scrolls — and a
  // focused button/link/field keeps its own Space.
  const playPauseRef = useRef(onPlayPause);
  useEffect(() => {
    playPauseRef.current = onPlayPause;
  });
  useEffect(() => {
    if (!ready) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!wrapRef.current?.closest('[role="dialog"]')) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('button, a[href], select, textarea, input:not([type="range"]), [contenteditable="true"]')) return;
      e.preventDefault();
      playPauseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  const onScrub = (value: number) => {
    const player = playerRef.current;
    if (!player) return;
    stopHold();
    player.pause();
    player.timestamp = value;
    resetCues(value);
    setPlaying(false);
    setPositionMs(value);
    lastPolledPosRef.current = value;
  };

  /**
   * Switches between capped idle pauses and the true gaps. The player's own
   * timeline is re-authored in place and the position carried across (same
   * moment in the same move), so the cube doesn't jump and elapsed/total and
   * the scrubber stay in the new timing's units.
   */
  const onToggleRealPauses = () => {
    const next = !realPauses;
    const to = next ? timelines.real : timelines.capped;
    const player = playerRef.current;
    const pos = remapPosition(positionMs, timeline, to);
    writeRealPauses(next);
    setRealPauses(next);
    if (!player || leafMovesRef.current.length === 0) return;
    stopHold();
    player.pause();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    player.experimentalModel.animationTimelineLeavesRequest.set(leavesFor(leafMovesRef.current, to) as any);
    leafStartsRef.current = to.starts;
    player.timestamp = pos;
    resetCues(pos);
    lastPolledPosRef.current = pos;
    setPositionMs(pos);
    if (playing) player.play();
  };

  const onToggleSound = () => {
    // Created inside this click handler (a real user gesture), not lazily
    // from the poll loop, so browsers' autoplay policy doesn't suspend it.
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioCtxRef.current = new Ctor();
    }
    void audioCtxRef.current?.resume?.();
    setSoundOn((v) => !v);
  };

  const shownPos = Math.min(positionMs, durationMs);
  const activeMove = durationMs > 0 ? activeLeaf(timeline.starts, shownPos) : -1;
  const segments = useMemo(() => (marks && timelineOk ? markSegments(marks, timeline) : []), [marks, timelineOk, timeline]);

  // The camera leans toward each face as it turns (and after the recorded tilt, where there is one).
  const leanTurns = useMemo(() => {
    const tokens = alg.split(/\s+/).filter(Boolean);
    return timelineOk && tokens.length === timeline.starts.length ? buildLeanTurns(tokens, timeline.starts, timeline.ends) : [];
  }, [alg, timelineOk, timeline]);
  useReplayCamera({
    playerRef,
    hostRef: containerRef,
    active: ready && timelineOk,
    turns: leanTurns,
    starts: timeline.starts,
    durationMs,
    positionMs: shownPos,
    playing,
    speed,
    gyro,
  });

  // Where the time went, on the scrubber's own timeline (true timing makes the curve, whichever timing is shown).
  const paceCurve = useMemo(() => (hasRealTiming && timelineOk ? buildPaceCurve(timelines.real, timeline) : null), [hasRealTiming, timelineOk, timelines.real, timeline]);

  const ghostCtl = useReplayGhostControl(hasRealTiming && timelineOk ? (ghost ?? null) : null);

  // The scrubber's filled part ends under the thumb's centre, not at the raw percentage (the thumb never reaches the track's ends).
  const frac = durationMs > 0 ? shownPos / durationMs : 0;
  const scrubFill = `calc(${frac * 100}% + ${(0.5 - frac) * THUMB_PX}px)`;

  return (
    <div ref={wrapRef} className="flex w-full flex-col items-center gap-3">
      <CubeStage
        className={className}
        state={loadFailed ? "failed" : ready ? "ready" : "loading"}
        onRetry={() => {
          setLoadFailed(false);
          setLoadAttempt((n) => n + 1);
        }}
      >
        <div ref={containerRef} className="cube-stage__cube h-full w-full" />
        {overlay && ready && timelineOk && (
          <div className="pointer-events-none absolute left-1 top-1">{overlay({ positionMs: shownPos, activeMove, timeline, playing, speed })}</div>
        )}
        {ghost && ghostCtl.on && ready && timelineOk && (
          <div className="pointer-events-none absolute right-1 top-1">
            {ghostCtl.ghost ? (
              <ReplayGhostTwin
                ghost={ghostCtl.ghost}
                caption={ghost.caption}
                shown={timeline}
                real={timelines.real}
                positionMs={shownPos}
                playing={playing}
                speed={speed}
                turnMs={timelines.turnMs}
              />
            ) : (
              <p role="status" className="rounded-full bg-bg-panel/80 px-2 py-0.5 text-[10px] text-muted">
                {ghostCtl.status === "failed" ? "Couldn't work out a model solution" : "Working out the model solution"}
              </p>
            )}
          </div>
        )}
      </CubeStage>

      {cues && cues.length > 0 && (
        <div className="flex min-h-[3.5rem] w-full flex-col items-center justify-center rounded-xl bg-bg-panel-2 px-3 py-2 text-center" aria-live="polite">
          {caption ? (
            <>
              <p className={cn("text-[11px] font-bold uppercase tracking-wide", CUE_TONE[caption.tone])}>{caption.title}</p>
              <p className="text-xs leading-snug text-foreground">{caption.line}</p>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Clapperboard size={12} className="text-accent" /> Director&apos;s Cut, press play for the narrated replay
            </p>
          )}
        </div>
      )}

      {!ready && !loadFailed && <ReplayControlsSkeleton withTicks={!!marks && marks.length > 1} />}

      {ready && durationMs > 0 && (
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onPlayPause}
              className="flex h-10 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {atEnd ? "Replay" : playing ? "Pause" : "Play"}
            </button>
            <div className="flex h-10 items-center gap-0.5 rounded-full bg-bg-panel-2 p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    "h-8 min-w-9 rounded-full px-2 text-xs font-medium tabular-nums transition-colors",
                    speed === s ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Mute move sounds" : "Play a click on every move"}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                soundOn ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
              )}
            >
              {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </div>

          <div className="flex w-full max-w-sm items-start gap-3">
            <div className="min-w-0 flex-1">
              {paceCurve && (
                <div className="mb-0.5">
                  <ReplayPaceCurve curve={paceCurve} frac={frac} ticks={segments.slice(0, -1).map((seg) => seg.endMs / durationMs)} inset={THUMB_PX / 2} />
                </div>
              )}
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={durationMs}
                  step={1}
                  value={shownPos}
                  onChange={(e) => onScrub(Number(e.target.value))}
                  className="replay-scrub"
                  style={{ "--p": scrubFill } as CSSProperties}
                  aria-label="Scrub through the moves"
                  aria-valuetext={`${formatTime(shownPos)} of ${formatTime(durationMs)}`}
                />
                {segments.slice(0, -1).map((seg) => (
                  <span
                    key={`${seg.label}-${seg.endMs}`}
                    aria-hidden
                    title={`${seg.label} done`}
                    className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-foreground/50"
                    style={{ left: `calc(${(seg.endMs / durationMs) * 100}% + ${(0.5 - seg.endMs / durationMs) * THUMB_PX}px - 1px)` }}
                  />
                ))}
              </div>
              {segments.length > 1 && (
                <div className="flex h-3.5 px-2 text-[10px] font-medium uppercase leading-3.5 tracking-wide text-muted-2" aria-hidden>
                  {segments.map((seg) => {
                    const w = (seg.endMs - seg.startMs) / durationMs;
                    return (
                      <span key={`${seg.label}-${seg.startMs}`} className="min-w-0 truncate text-center" style={{ width: `${w * 100}%` }}>
                        {w >= 0.1 ? seg.label : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <p className={cn("h-7 w-[5.5rem] shrink-0 text-right text-xs leading-7 tabular-nums text-muted", paceCurve && "mt-9")} aria-hidden>
              <span className="font-medium text-foreground">{formatTime(shownPos)}</span> / {formatTime(durationMs)}
            </p>
          </div>

          <div className="flex min-h-7 flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-2">
              {hasRealTiming ? (
                <>
                  <Clock size={12} className="text-accent" /> {realPauses || !canToggleRealPauses ? "Timed exactly as solved" : "Real move timing, long pauses shortened"}
                </>
              ) : (
                <>
                  <Gauge size={12} /> Estimated pacing, no capture timing for this solve
                </>
              )}
            </p>
            {canToggleRealPauses && (
              <button
                type="button"
                onClick={onToggleRealPauses}
                aria-pressed={realPauses}
                title="Off: pauses over about 0.6s are shortened. On: every pause plays at its true length."
                className={cn(
                  "hit-y h-7 rounded-full px-3 text-[11px] font-medium transition-colors",
                  realPauses ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Real pauses
              </button>
            )}
            {ghost && hasRealTiming && (
              <button
                type="button"
                onClick={ghostCtl.toggle}
                aria-pressed={ghostCtl.on}
                title={
                  ghost.kind === "pb"
                    ? "A faint second cube: your best earlier solve, turning at the same elapsed time."
                    : "A faint second cube: a model solution of this scramble, at your pace."
                }
                className={cn(
                  "hit-y h-7 rounded-full px-3 text-[11px] font-medium transition-colors",
                  ghostCtl.on ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                {ghost.toggle}
              </button>
            )}
          </div>
        </div>
      )}

      {renderMoves?.(activeMove)}
    </div>
  );
}
