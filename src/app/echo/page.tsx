"use client";

import { useEffect, useReducer, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { FACE_HEX, HOME_COLOR, PlayShell, TurnPad } from "@/components/play/PlayShell";
import { usePlayInput } from "@/lib/play/usePlayInput";
import { useStored } from "@/lib/play/useStored";
import { IDLE, echoReduce, showTiming } from "@/lib/play/echo";

const ACCENT = "#3dffb0";
const BEST_KEY = "echo-best";
const LEAD_IN_MS = 550;

/** The face a grip turn moves, tinted the colour it is in the home grip (yellow top, green front). */
const tint = (turn: string) => FACE_HEX[HOME_COLOR[turn[0]]];

/**
 * Echo: watch a run of turns, play it back from memory, and it adds one
 * more. Quarter turns only, in grip notation — so it follows the gyro if you
 * regrip — and one wrong turn ends the run.
 */
export default function EchoPage() {
  const [game, dispatch] = useReducer(echoReduce, IDLE);
  const [lit, setLit] = useState(-1);
  const [best, setBest] = useStored<number>(BEST_KEY, 0);
  const { connected, press } = usePlayInput((t) => dispatch({ type: "turn", grip: t.grip }));

  // Plays the run out on screen, then hands over.
  useEffect(() => {
    if (game.phase !== "show") return undefined;
    const { onMs, offMs } = showTiming(game.seq.length);
    const timers: ReturnType<typeof setTimeout>[] = [];
    game.seq.forEach((_, i) => {
      const at = LEAD_IN_MS + i * (onMs + offMs);
      timers.push(setTimeout(() => setLit(i), at));
      timers.push(setTimeout(() => setLit(-1), at + onMs));
    });
    timers.push(setTimeout(() => dispatch({ type: "shown" }), LEAD_IN_MS + game.seq.length * (onMs + offMs)));
    return () => {
      timers.forEach(clearTimeout);
      setLit(-1);
    };
  }, [game.phase, game.seq]);

  const over = game.phase === "over";
  useEffect(() => {
    if (over && game.round > best) setBest(game.round);
  }, [over, game.round, best, setBest]);

  const shown = game.phase === "show" && lit >= 0 ? game.seq[lit] : null;
  const label =
    game.phase === "idle"
      ? "Ready?"
      : game.phase === "show"
        ? "Watch"
        : game.phase === "input"
          ? `Your turn, ${game.input.length} of ${game.seq.length}`
          : "Missed it";

  return (
    <PlayShell accent={ACCENT} title="Echo" tagline="Watch the turns, then play them back from memory. Every round adds one. One wrong turn and it's over.">
      <div className="play-panel play-glow flex flex-col items-center gap-4 rounded-3xl px-4 py-6" data-testid="echo-stage">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--play-dim)]" data-testid="echo-label">
          {label}
        </p>

        <div className="flex h-36 w-full items-center justify-center" aria-live="polite">
          {shown ? (
            <span
              key={lit}
              className="flex h-32 w-32 items-center justify-center rounded-3xl border-4 text-[64px] font-black"
              style={{ borderColor: tint(shown), color: tint(shown), boxShadow: `0 0 50px -8px ${tint(shown)}` }}
              data-testid="echo-move"
            >
              {shown}
            </span>
          ) : over && game.miss ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm text-[var(--play-dim)]">It wanted</p>
              <span className="text-[44px] font-black" style={{ color: tint(game.miss.expected) }}>
                {game.miss.expected}
              </span>
              <p className="text-xs text-[var(--play-dim)]">you turned {game.miss.got}</p>
            </div>
          ) : game.phase === "input" ? (
            <span className="text-[56px] font-black text-white/25">?</span>
          ) : (
            <span className="text-[56px] font-black text-white/15">·</span>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5" data-testid="echo-dots">
          {game.seq.map((_, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full transition-colors"
              style={{
                background:
                  game.phase === "show" && i === lit
                    ? "#fff"
                    : i < game.input.length
                      ? ACCENT
                      : over && i === game.input.length
                        ? "#ff3b4a"
                        : "rgba(255,255,255,0.14)",
              }}
            />
          ))}
        </div>

        <div className="flex items-end gap-8">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--play-dim)]">Rounds</p>
            <p className="text-3xl font-black" data-testid="echo-round">{game.round}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--play-dim)]">Best</p>
            <p className="text-3xl font-black text-white/70" data-testid="echo-best">{Math.max(best, over ? game.round : 0)}</p>
          </div>
        </div>

        {(game.phase === "idle" || over) && (
          <button type="button" onClick={() => dispatch({ type: "start", seed: Date.now() })} className="play-btn flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black">
            {over ? <RotateCcw size={16} /> : <Play size={16} />} {over ? "Play again" : "Start"}
          </button>
        )}
      </div>

      <TurnPad onTurn={(g) => press(g)} />
      <p className="text-center text-[11px] text-[var(--play-dim)]">
        {connected ? "Turn your cube, quarter turns only (a half turn counts as two)." : "No cube connected, use the pad above or the keyboard (I K · E D · J F · S L · H G · W O)."}
      </p>
    </PlayShell>
  );
}
