"use client";

import { useEffect, useRef, useState } from "react";
import { Bluetooth, ChevronDown, ChevronUp, Loader2, Radio, Swords, Trophy, Wifi, WifiOff, Zap } from "lucide-react";
import { useRaceStore, type RaceCubeMove } from "@/lib/store/raceStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/authStore";
import { fetchRaceLeaderboard, type RaceLeaderboard } from "@/lib/social/raceRating";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSmartCubeFlow } from "@/hooks/useSmartCubeFlow";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const webrtcSupported = typeof window !== "undefined" && "RTCPeerConnection" in window;
const quickConnectAvailable = isSupabaseConfigured();

function CodeBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <textarea
        readOnly
        value={value}
        rows={3}
        className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed text-foreground outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <p className="text-[11px] text-muted-2">{hint}</p>
      </div>
    </div>
  );
}

/** The race's own auto-started, tap-to-stop stopwatch — separate from the main timer, since it starts on a synchronized signal rather than a hold. */
function RaceClock({ startAtMs, onStop }: { startAtMs: number; onStop: (timeMs: number) => void }) {
  const [displayMs, setDisplayMs] = useState(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (stoppedRef.current) return;
      setDisplayMs(Math.max(0, Date.now() - startAtMs));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startAtMs]);

  const stop = () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    onStop(Date.now() - startAtMs);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={stop}
      className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-6 text-center text-3xl font-bold text-foreground active:opacity-80 sm:text-4xl"
    >
      {formatTime(displayMs)}
    </button>
  );
}

/** Opponent's live-ticking number — read-only, derived purely from the shared start epoch both sides already agreed on (see raceStore's "start" message), so it needs no per-tick network traffic at all: just Date.now() minus that epoch, same math RaceClock does for your own. */
function OpponentClock({ startAtMs }: { startAtMs: number }) {
  const [displayMs, setDisplayMs] = useState(0);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setDisplayMs(Math.max(0, Date.now() - startAtMs));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startAtMs]);

  return (
    <p className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-6 text-center text-3xl font-bold text-muted sm:text-4xl">
      {formatTime(displayMs)}
    </p>
  );
}

/**
 * The opponent's side of the race, live: their finished time once they have
 * one, otherwise a cube mimic (if they're on a smart cube — driven by moves
 * relayed over the data channel, same LiveCubeMimic the solo timer uses
 * locally) or just their ticking clock. Shared between the "still solving"
 * and "waiting for them" states below rather than duplicated.
 */
function OpponentPanel({
  startAtMs,
  opponentTimeMs,
  opponentHasSmartCube,
  opponentMoves,
  scramble,
}: {
  startAtMs: number;
  opponentTimeMs: number | null;
  opponentHasSmartCube: boolean;
  opponentMoves: RaceCubeMove[];
  scramble: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-2">
        Opponent
        {opponentHasSmartCube && <Bluetooth size={10} className="text-accent" />}
      </p>
      {opponentTimeMs !== null ? (
        <p className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-6 text-center text-3xl font-bold text-foreground sm:text-4xl">
          {formatTime(opponentTimeMs)}
        </p>
      ) : opponentHasSmartCube ? (
        <div className="h-32 w-full overflow-hidden rounded-xl bg-bg-panel-2">
          <LiveCubeMimic scramble={scramble} moves={opponentMoves} className="h-full w-full" />
        </div>
      ) : (
        <OpponentClock startAtMs={startAtMs} />
      )}
    </div>
  );
}

/** Small "1204" pill next to a ready-status label — only rendered once a rating is known (i.e. that side is signed in), so an anonymous racer's row just has no badge rather than a misleading placeholder. */
function RatingBadge({ rating }: { rating: number }) {
  return <span className="rounded-full bg-bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-2">{rating}</span>;
}

/**
 * Top race ratings across every signed-in racer — a plain rank list fetched
 * on demand (this data changes with every race in the whole app, so there's
 * no good moment to keep it live-subscribed; a fresh pull whenever the
 * panel opens is plenty for a casual leaderboard like this).
 */
function RaceLeaderboardPanel() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<RaceLeaderboard | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!open && !board) {
      setLoading(true);
      void fetchRaceLeaderboard(user?.id ?? null).then((result) => {
        setBoard(result);
        setLoading(false);
      });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-[11px] font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <Trophy size={12} className="text-warning" /> Race leaderboard
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="mt-2">
          {loading && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-2">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </p>
          )}
          {!loading && board && board.top.length === 0 && (
            <p className="text-[11px] text-muted-2">No rated races yet — sign in and race someone to start the board.</p>
          )}
          {!loading && board && board.top.length > 0 && (
            <>
              {board.yourRank && (
                <p className="mb-1.5 text-[11px] text-muted-2">
                  You: #{board.yourRank} of {board.total}
                </p>
              )}
              <ol className="flex flex-col gap-1">
                {board.top.map((entry, i) => (
                  <li
                    key={entry.username}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1 text-xs",
                      entry.isYou ? "bg-accent-soft text-accent" : "text-foreground/90",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="w-4 shrink-0 text-muted-2">{i + 1}</span>
                      <span className="truncate">{entry.username}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-muted-2">
                        {entry.wins}-{entry.losses}
                      </span>
                      <span className="tabular-nums font-semibold">{entry.rating}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Head-to-head racing over a direct WebRTC connection to another browser —
 * no account, no server we run, just a connection code you send your
 * opponent however you'd normally talk to them. See raceStore.ts for the
 * exact handshake.
 */
export function RaceMode() {
  const {
    mode,
    busy,
    error,
    localCode,
    roomCode,
    connected,
    scramble,
    myReady,
    opponentReady,
    startAtMs,
    raceState,
    myTimeMs,
    opponentTimeMs,
    myHasSmartCube,
    opponentHasSmartCube,
    opponentMoves,
    matchmaking,
    myRating,
    opponentRating,
    ratingDelta,
    startJoining,
    submitOfferCode,
    submitAnswerCode,
    hostQuick,
    joinQuick,
    quickMatch,
    setReady,
    finish,
    rematch,
    disconnect,
    reset,
    setMyHasSmartCube,
    reportMove,
  } = useRaceStore();

  const [pasteValue, setPasteValue] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [manualJoin, setManualJoin] = useState(false);
  const [countdownLabel, setCountdownLabel] = useState("");
  // `mode` is set once (hosting/joining) and never flips mid-session, so it
  // doubles as "am I the host" for the whole connected lifetime too.
  const isHost = mode === "hosting";

  useEffect(() => () => reset(), [reset]);

  // Local-only UI state has no home in the store (it's never sent anywhere) — clear it whenever the racer backs out to start fresh.
  const handleDisconnect = () => {
    disconnect();
    setPasteValue("");
    setJoinCodeInput("");
    setManualJoin(false);
  };

  useEffect(() => {
    if (raceState !== "countdown" || startAtMs === null) return;
    let raf: number;
    const tick = () => {
      const remaining = Math.ceil((startAtMs - Date.now()) / 1000);
      setCountdownLabel(remaining > 0 ? String(remaining) : "GO");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [raceState, startAtMs]);

  // Smart-cube side of the race: reuses the exact same scramble-match ->
  // inspection -> arm flow the solo SmartCubeTimer drives off (see
  // useSmartCubeFlow's own doc comment) — this hook is a safe no-op when no
  // cube is connected, so it's always called rather than conditionally.
  const smartCubeConnected = useSmartCubeStore((s) => s.connected);
  const scMoves = useSmartCubeStore((s) => s.moves);
  const scStartedAtMs = useSmartCubeStore((s) => s.startedAtMs);
  const scSolvedAtMs = useSmartCubeStore((s) => s.solvedAtMs);
  useSmartCubeFlow(scramble ?? "");

  // Tell the opponent whether a smart cube is driving this side, so they
  // know whether to expect a live cube visual from us or just a timer.
  useEffect(() => {
    if (connected) setMyHasSmartCube(smartCubeConnected);
  }, [connected, smartCubeConnected, setMyHasSmartCube]);

  // Relay every new move the instant it happens — same edge-triggered
  // "everything from the last index I sent" approach as the auto-save
  // effect in SmartCubeTimer.tsx, reset whenever a fresh arm() clears
  // smartCubeStore's own move list back to empty (new scramble/rematch).
  const lastRelayedCountRef = useRef(0);
  useEffect(() => {
    if (scMoves.length === 0) lastRelayedCountRef.current = 0;
    if (!smartCubeConnected) return;
    for (let i = lastRelayedCountRef.current; i < scMoves.length; i++) reportMove(scMoves[i].token, scMoves[i].timeStampMs);
    lastRelayedCountRef.current = scMoves.length;
  }, [scMoves, smartCubeConnected, reportMove]);

  // Auto-finish for a smart-cube racer the instant the physical cube reads
  // solved — mirrors SmartCubeTimer's own auto-record effect, including
  // using the cube connection's own event-stream clock (solvedAtMs -
  // startedAtMs) rather than wall time, since that's the actual solve
  // duration untouched by main-thread jank.
  const autoFinishedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!smartCubeConnected || raceState !== "running" || myTimeMs !== null) return;
    if (scSolvedAtMs === null || scStartedAtMs === null) return;
    if (autoFinishedAtRef.current === scSolvedAtMs) return;
    autoFinishedAtRef.current = scSolvedAtMs;
    finish(scSolvedAtMs - scStartedAtMs);
  }, [smartCubeConnected, raceState, myTimeMs, scSolvedAtMs, scStartedAtMs, finish]);

  if (!webrtcSupported) {
    return (
      <div className="card w-full max-w-xl rounded-xl p-3">
        <p className="text-xs text-muted-2">This browser doesn&apos;t support WebRTC, so live racing isn&apos;t available here.</p>
      </div>
    );
  }

  const bothReady = myReady && opponentReady;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Swords size={15} className="text-accent" />
            Live race
          </h2>
          {mode !== "idle" && (
            <span className={cn("flex items-center gap-1 text-[11px] font-medium", connected ? "text-success" : "text-muted-2")}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? "Connected" : "Not connected"}
            </span>
          )}
        </div>

        {mode === "idle" && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Race someone directly, browser to browser — no account. Quick Match pairs you with anyone else looking
              for a race right now; hosting gets you a short code to share with someone specific.
            </p>
            {quickConnectAvailable && (
              <button
                type="button"
                onClick={() => void quickMatch()}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg"
              >
                <Zap size={15} /> Quick Match
              </button>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void hostQuick()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-semibold text-foreground"
              >
                <Radio size={13} /> Host a race
              </button>
              <button
                type="button"
                onClick={startJoining}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-semibold text-foreground"
              >
                Join a race
              </button>
            </div>
            <RaceLeaderboardPanel />
          </>
        )}

        {matchmaking && !connected && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 size={20} className="animate-spin text-accent" />
            <p className="text-xs font-medium text-foreground">Finding an opponent…</p>
            <p className="max-w-[16rem] text-center text-[11px] text-muted-2">
              Matches you with anyone else looking for a quick race right now.
            </p>
          </div>
        )}

        {mode === "hosting" && !connected && !matchmaking && (
          <div className="flex flex-col gap-3">
            {busy && !roomCode && !localCode && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> Setting up your race…
              </p>
            )}
            {roomCode && (
              <div className="flex flex-col items-center gap-2 py-2">
                <p className="text-[11px] font-medium text-muted">Give them this code</p>
                <p className="text-4xl font-bold tracking-[0.3em] text-accent">{roomCode}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-2">
                  <Loader2 size={13} className="animate-spin" /> Waiting for them to join…
                </p>
              </div>
            )}
            {!roomCode && localCode && (
              <>
                <CodeBox label="1. Send this code to your opponent" value={localCode} hint="They'll paste it into their own 'Join a race'." />
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-medium text-muted">2. Paste the code they send back</p>
                  <textarea
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    rows={3}
                    placeholder="Their answer code…"
                    className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => void submitAnswerCode(pasteValue)}
                    disabled={!pasteValue.trim() || busy}
                    className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
                  >
                    Connect
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "joining" && !connected && !matchmaking && quickConnectAvailable && !manualJoin && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium text-muted">Enter their room code</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                placeholder="ABCDE"
                className="flex-1 rounded-lg bg-bg-panel-2 px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.3em] text-foreground outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => void joinQuick(joinCodeInput)}
                disabled={joinCodeInput.length < 5 || busy}
                className="flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-fg disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : "Join"}
              </button>
            </div>
            <button type="button" onClick={() => setManualJoin(true)} className="self-start text-[11px] text-muted-2 underline">
              Have a code to paste instead?
            </button>
          </div>
        )}

        {mode === "joining" && !connected && !matchmaking && (!quickConnectAvailable || manualJoin) && (
          <div className="flex flex-col gap-3">
            {!localCode ? (
              <>
                <p className="text-[11px] font-medium text-muted">Paste the code your opponent sent you</p>
                <textarea
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  rows={3}
                  placeholder="Their host code…"
                  className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => void submitOfferCode(pasteValue)}
                  disabled={!pasteValue.trim() || busy}
                  className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
                >
                  {busy ? "Working…" : "Generate my code"}
                </button>
              </>
            ) : (
              <>
                <CodeBox label="Send this code back to them" value={localCode} hint="Once they paste it in, you'll connect automatically." />
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Waiting for them to connect…
                </p>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

        {connected && (
          <div className="flex flex-col gap-3">
            {scramble && raceState === "lobby" && (
              <>
                <div className="mx-auto w-full max-w-[13rem]">
                  <ScrambleNet scramble={scramble} className="w-full" />
                </div>
                <p className="tabular-timer break-words text-center text-sm font-medium leading-relaxed text-foreground/90">{scramble}</p>
                <div className="flex items-center justify-center gap-3 text-[11px]">
                  <span className={cn("flex items-center gap-1", myReady ? "text-success" : "text-muted-2")}>
                    {myHasSmartCube && <Bluetooth size={11} />} You {myReady ? "ready" : "not ready"}
                    {myRating !== null && <RatingBadge rating={myRating} />}
                  </span>
                  <span className={cn("flex items-center gap-1", opponentReady ? "text-success" : "text-muted-2")}>
                    {opponentHasSmartCube && <Bluetooth size={11} />} Opponent {opponentReady ? "ready" : "not ready"}
                    {opponentRating !== null && <RatingBadge rating={opponentRating} />}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReady(!myReady)}
                  className={cn(
                    "self-center rounded-lg px-4 py-2 text-xs font-semibold",
                    myReady ? "bg-bg-panel-2 text-foreground" : "bg-accent text-accent-fg",
                  )}
                >
                  {myReady ? "Cancel ready" : "I'm ready"}
                </button>
                {bothReady && <p className="text-center text-[11px] text-muted-2">Starting…</p>}
              </>
            )}

            {raceState === "countdown" && (
              <p className="py-8 text-center text-6xl font-bold text-accent">{countdownLabel}</p>
            )}

            {raceState === "running" && startAtMs !== null && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-2">
                    You
                    {myHasSmartCube && <Bluetooth size={10} className="text-accent" />}
                  </p>
                  {myTimeMs !== null ? (
                    <p className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-6 text-center text-3xl font-bold text-foreground sm:text-4xl">
                      {formatTime(myTimeMs)}
                    </p>
                  ) : myHasSmartCube ? (
                    <div className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-panel-2">
                      <Bluetooth size={20} className="animate-pulse text-accent" />
                      <p className="text-[11px] text-muted-2">solving on your cube…</p>
                    </div>
                  ) : (
                    <RaceClock startAtMs={startAtMs} onStop={finish} />
                  )}
                </div>
                <OpponentPanel
                  startAtMs={startAtMs}
                  opponentTimeMs={opponentTimeMs}
                  opponentHasSmartCube={opponentHasSmartCube}
                  opponentMoves={opponentMoves}
                  scramble={scramble ?? ""}
                />
              </div>
            )}
            {raceState === "running" && myTimeMs === null && !myHasSmartCube && (
              <p className="text-center text-[11px] text-muted-2">tap the clock (or press space) to stop</p>
            )}
            {raceState === "running" && myTimeMs !== null && opponentTimeMs === null && (
              <p className="text-center text-[11px] text-muted-2">waiting for your opponent to finish…</p>
            )}

            {raceState === "finished" && myTimeMs !== null && opponentTimeMs !== null && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Trophy size={22} className={cn(myTimeMs < opponentTimeMs ? "text-warning" : "text-muted-2")} />
                <p className="text-sm font-semibold">
                  {myTimeMs < opponentTimeMs
                    ? `You won by ${formatTime(opponentTimeMs - myTimeMs)}`
                    : myTimeMs > opponentTimeMs
                      ? `You lost by ${formatTime(myTimeMs - opponentTimeMs)}`
                      : "Tied!"}
                </p>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-2">You</p>
                    <p className="tabular-timer text-lg font-medium">{formatTime(myTimeMs)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-2">Opponent</p>
                    <p className="tabular-timer text-lg font-medium">{formatTime(opponentTimeMs)}</p>
                  </div>
                </div>
                {ratingDelta !== null && myRating !== null && (
                  <p className={cn("text-xs font-semibold", ratingDelta >= 0 ? "text-success" : "text-danger")}>
                    {ratingDelta >= 0 ? "+" : ""}
                    {ratingDelta} rating → {myRating}
                  </p>
                )}
                {isHost ? (
                  <button
                    type="button"
                    onClick={() => void rematch()}
                    className="mt-1 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-fg"
                  >
                    Rematch
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-2">Waiting for the host to start a rematch…</p>
                )}
              </div>
            )}
          </div>
        )}

        {mode !== "idle" && (
          <button type="button" onClick={handleDisconnect} className="mt-3 text-[11px] text-muted-2 hover:text-danger">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
