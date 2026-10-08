"use client";

import { useEffect, useReducer, useRef } from "react";
import { Flag, Play, RotateCcw, SkipForward } from "lucide-react";
import { PlayShell, TurnPad } from "@/components/play/PlayShell";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { usePlayInput } from "@/lib/play/usePlayInput";
import { useStored } from "@/lib/play/useStored";
import { Cube, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { ScrambleGuide } from "@/lib/smartcube/scrambleGuide";
import { countStrokes, generateHole, scoreLabel } from "@/lib/play/golf";
import { MENU, ROUND_PARS, SKIP_PENALTY, golfReduce, totalOverPar } from "@/lib/play/golfGame";
import { cn } from "@/lib/utils/cn";

const BEST_KEY = "golf-best";

const overLabel = (n: number) => (n === 0 ? "Even" : n > 0 ? `+${n}` : `${n}`);

/**
 * Cube Golf: scramble the cube a few turns, then solve it in as few turns as
 * you can. Par is the true shortest solution — worked out exactly, not
 * guessed — so the best you can do is tie it, and after every hole you're
 * shown the way it was done. Scoring counts your solution's length once
 * cancelling turns are merged: R R' is free, R R is one stroke (R2).
 */
export default function GolfPage() {
  const [game, dispatch] = useReducer(golfReduce, MENU);
  const [best, setBest] = useStored<number | null>(BEST_KEY, null);
  /** This page's own copy of the cube, advanced turn by turn and re-read from a real cube whenever it reports. */
  const model = useRef<CubeJSInstance>(newCube());
  const latest = useRef({ facelets: SOLVED_FACELETS, connected: false });
  const resetRef = useRef<(to?: string) => void>(() => {});

  const { connected, facelets, press, resetVirtual } = usePlayInput((t) => {
    if (t.source === "cube") model.current = Cube.fromString(useSmartCubeStore.getState().liveFacelets);
    else model.current.move(t.physical);
    dispatch({ type: "turn", token: t.physical, facelets: model.current.asString() });
  });
  useEffect(() => {
    latest.current = { facelets, connected };
    resetRef.current = resetVirtual;
  });

  // Sets up the next hole (a beat after the "loading" frame paints — the exact-par search blocks for a moment).
  useEffect(() => {
    if (game.phase !== "loading") return undefined;
    const timer = setTimeout(() => {
      const hole = generateHole(ROUND_PARS[game.index], game.seed + game.index * 7919);
      // Without a cube, every hole starts from a fresh virtual one; with one, it must already be solved.
      if (!latest.current.connected) resetRef.current();
      const start = latest.current.connected ? latest.current.facelets : SOLVED_FACELETS;
      model.current = Cube.fromString(start);
      dispatch({ type: "hole", hole, facelets: start });
    }, 40);
    return () => clearTimeout(timer);
  }, [game.phase, game.index, game.seed]);

  const total = totalOverPar(game.results);
  const cardDone = game.phase === "card";
  useEffect(() => {
    if (cardDone && (best === null || total < best)) setBest(total);
  }, [cardDone, total, best, setBest]);

  const hole = game.hole;
  const guideView = (() => {
    if (!hole || game.phase !== "setup") return null;
    const guide = new ScrambleGuide(hole.scramble);
    for (const t of game.setupTurns) guide.push(t);
    return guide.view();
  })();
  const last = game.results[game.results.length - 1];

  const skip = () => {
    if (!latest.current.connected) {
      resetRef.current();
      model.current = newCube();
    }
    dispatch({ type: "skip" });
  };

  return (
    <PlayShell title="Cube golf" tagline="Scramble a few turns, then solve it in as few as you can. Par is the shortest possible, you can tie it, never beat it.">
      {game.phase === "menu" && (
        <div className="play-panel flex flex-col gap-3 rounded-2xl p-5" data-testid="golf-menu">
          <p className="text-sm leading-snug text-white/80">
            Six holes, from 3 turns to 7. Each one shows you the scramble; do it, then solve the cube in the fewest turns you can. A half turn counts as one; turns that cancel cost nothing.
          </p>
          <p className="text-xs text-[var(--play-dim)]">Start with your cube solved. Turns are named by the colour of the face: U white, D yellow, F green, B blue, R red, L orange.</p>
          {best !== null && <p className="text-xs font-semibold text-white/70">Best round: {overLabel(best)} over par</p>}
          <button type="button" onClick={() => dispatch({ type: "start", seed: Date.now() })} className="play-btn flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold">
            <Play size={16} strokeWidth={1.75} /> Tee off
          </button>
        </div>
      )}

      {game.phase !== "menu" && game.phase !== "card" && (
        <div className="play-panel flex flex-col items-center gap-4 rounded-2xl px-4 py-5" data-testid="golf-hole">
          <div className="flex w-full items-center justify-between text-[11px] font-bold text-[var(--play-dim)]">
            <span data-testid="golf-hole-no">
              Hole {game.index + 1} of {ROUND_PARS.length}
            </span>
            <span className="flex items-center gap-1" data-testid="golf-par">
              <Flag size={12} strokeWidth={1.75} /> Par {ROUND_PARS[game.index]}
            </span>
          </div>

          {game.phase === "loading" && (
            <p className="py-10 text-sm text-[var(--play-dim)]">
              Setting up the hole
            </p>
          )}

          {game.phase === "reset" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="golf-reset">
              <p className="text-base font-bold">Solve your cube to start the hole</p>
              <p className="max-w-xs text-xs text-[var(--play-dim)]">It picks up the moment the cube reads solved.</p>
              <button
                type="button"
                onClick={() => {
                  useSmartCubeStore.getState().resyncSolved();
                  model.current = newCube();
                  dispatch({ type: "confirmSolved" });
                }}
                className="text-xs text-[var(--play-dim)] underline hover:text-white"
              >
                It is solved
              </button>
            </div>
          )}

          {game.phase === "setup" && hole && guideView && (
            <div className="flex w-full flex-col items-center gap-3" data-testid="golf-setup" data-steps={hole.scramble.join(" ")}>
              <p className="text-base font-bold">Scramble it</p>
              {guideView.undo.length > 0 || guideView.fix ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 ring-1 ring-warning/40">
                  <p className="text-xs font-semibold text-warning">{guideView.fix ? `Not quite, turn ${guideView.fix} to fix step ${guideView.index + 1}` : `Wrong turn, undo ${guideView.undo.length === 1 ? "this" : `these ${guideView.undo.length}`}`}</p>
                  <RouteChips display={guideView.fix ? [guideView.fix] : guideView.undo} turns={guideView.fix ? [guideView.fix] : guideView.undo} position={0} size="lg" />
                </div>
              ) : null}
              <div className={cn("transition-opacity", (guideView.undo.length > 0 || guideView.fix) && "opacity-40")}>
                <RouteChips display={hole.scramble} turns={hole.scramble} position={guideView.index} partial={guideView.partial} size="lg" />
              </div>
            </div>
          )}

          {game.phase === "play" && hole && (
            <div className="flex flex-col items-center gap-3 py-2" data-testid="golf-play">
              <p className="text-base font-bold">Solve it, par is {hole.par}</p>
              <p className="text-[56px] font-bold leading-none" data-testid="golf-strokes">
                {countStrokes(game.playTurns)}
              </p>
              <p className="text-[11px] font-bold text-[var(--play-dim)]">strokes</p>
            </div>
          )}

          {game.phase === "holed" && hole && last && (
            <div className="flex w-full flex-col items-center gap-3 text-center" data-testid="golf-holed">
              <p className="text-2xl font-bold" style={{ color: last.strokes <= last.par ? "var(--play-accent)" : "#fff" }} data-testid="golf-verdict">
                {last.skipped ? `Skipped (+${SKIP_PENALTY})` : scoreLabel(last.strokes, last.par)}
              </p>
              <p className="text-sm text-white/70">
                {last.skipped ? "" : `${last.strokes} stroke${last.strokes === 1 ? "" : "s"} · `}par {last.par}
              </p>
              <p className="mt-1 text-[11px] font-bold text-[var(--play-dim)]">The shortest way</p>
              <RouteChips display={hole.solution} turns={hole.solution} position={0} size="md" />
              <button type="button" onClick={() => dispatch({ type: "next" })} className="play-btn mt-1 flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-bold" data-testid="golf-next">
                {game.index + 1 < ROUND_PARS.length ? "Next hole" : "Scorecard"}
              </button>
            </div>
          )}

          {(game.phase === "setup" || game.phase === "play" || game.phase === "reset") && (
            <button type="button" onClick={skip} className="flex items-center gap-1 text-[11px] text-[var(--play-dim)] underline hover:text-white">
              <SkipForward size={12} strokeWidth={1.75} /> Skip this hole (+{SKIP_PENALTY})
            </button>
          )}
        </div>
      )}

      {game.phase === "card" && (
        <div className="play-panel flex flex-col gap-3 rounded-2xl p-5" data-testid="golf-card">
          <h2 className="text-lg font-bold">Scorecard</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-[var(--play-dim)]">
                <th className="py-1">Hole</th>
                <th>Par</th>
                <th>Strokes</th>
                <th className="text-right">+/-</th>
              </tr>
            </thead>
            <tbody>
              {game.results.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1.5">{i + 1}</td>
                  <td>{r.par}</td>
                  <td>{r.skipped ? "skipped" : r.strokes}</td>
                  <td className="text-right font-semibold" style={{ color: r.strokes === r.par ? "var(--play-accent)" : undefined }}>
                    {overLabel(r.strokes - r.par)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-center text-2xl font-bold" data-testid="golf-total">
            {overLabel(total)} over par
          </p>
          {best !== null && <p className="text-center text-xs text-[var(--play-dim)]">Best round: {overLabel(best)}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => dispatch({ type: "start", seed: Date.now() })} className="play-btn flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold">
              <RotateCcw size={16} strokeWidth={1.75} /> Play again
            </button>
            <button type="button" onClick={() => dispatch({ type: "menu" })} className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-white/70 hover:text-white">
              Menu
            </button>
          </div>
        </div>
      )}

      <TurnPad onTurn={(g) => press(g)} />
      <p className="text-center text-[11px] text-[var(--play-dim)]">
        {connected ? "Turn your cube, it's read live." : "No cube connected, use the pad above or the keyboard; every hole starts from a fresh virtual cube."}
      </p>
    </PlayShell>
  );
}
