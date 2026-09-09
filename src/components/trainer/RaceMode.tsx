"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Radio, Swords, Trophy, Wifi, WifiOff } from "lucide-react";
import { useRaceStore } from "@/lib/store/raceStore";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const webrtcSupported = typeof window !== "undefined" && "RTCPeerConnection" in window;

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
      className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-8 text-center text-5xl font-bold text-foreground active:opacity-80"
    >
      {formatTime(displayMs)}
    </button>
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
    connected,
    scramble,
    myReady,
    opponentReady,
    startAtMs,
    raceState,
    myTimeMs,
    opponentTimeMs,
    startHosting,
    startJoining,
    submitOfferCode,
    submitAnswerCode,
    setReady,
    finish,
    rematch,
    disconnect,
    reset,
  } = useRaceStore();

  const [pasteValue, setPasteValue] = useState("");
  const [countdownLabel, setCountdownLabel] = useState("");
  // `mode` is set once (hosting/joining) and never flips mid-session, so it
  // doubles as "am I the host" for the whole connected lifetime too.
  const isHost = mode === "hosting";

  useEffect(() => () => reset(), [reset]);

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
              Race someone directly, browser to browser — no account, nothing running on our end. One of you hosts
              and shares a connection code, the other pastes it back; then you&apos;re on the same scramble racing
              live.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void startHosting()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg"
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
          </>
        )}

        {mode === "hosting" && !connected && (
          <div className="flex flex-col gap-3">
            {busy && !localCode && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> Setting up your connection…
              </p>
            )}
            {localCode && (
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

        {mode === "joining" && !connected && (
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
                  <span className={cn("flex items-center gap-1", myReady ? "text-success" : "text-muted-2")}>You {myReady ? "ready" : "not ready"}</span>
                  <span className={cn("flex items-center gap-1", opponentReady ? "text-success" : "text-muted-2")}>
                    Opponent {opponentReady ? "ready" : "not ready"}
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

            {raceState === "running" && myTimeMs === null && startAtMs !== null && (
              <>
                <RaceClock startAtMs={startAtMs} onStop={finish} />
                <p className="text-center text-[11px] text-muted-2">tap the clock (or press space) to stop</p>
              </>
            )}

            {raceState === "running" && myTimeMs !== null && (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="tabular-timer text-4xl font-bold text-foreground">{formatTime(myTimeMs)}</p>
                <p className="text-xs text-muted-2">waiting for your opponent to finish…</p>
              </div>
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
          <button type="button" onClick={disconnect} className="mt-3 text-[11px] text-muted-2 hover:text-danger">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
