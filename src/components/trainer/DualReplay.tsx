"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Film, Play } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { relativeTempoScales } from "@/lib/analysis/replayTempo";
import { formatTime } from "@/lib/utils/time";
import { solveFinalMs, type Solve } from "@/types";
import { withViewRotation } from "@/components/scramble/CubeViewer";
import { cn } from "@/lib/utils/cn";

interface ReplayCubeHandle {
  play: () => void;
  reset: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TwistyPlayerInstance = any;

/**
 * One 3D cube, driven imperatively (play/reset from the parent) rather than
 * through its own control panel — the whole point of this view is that both
 * sides move together on one shared command, not two independently-scrubbed
 * players.
 */
const ReplayCube = forwardRef<ReplayCubeHandle, { scramble: string; alg: string; tempoScale: number }>(
  ({ scramble, alg, tempoScale }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<TwistyPlayerInstance>(null);

    useEffect(() => {
      let cancelled = false;
      const container = containerRef.current;
      (async () => {
        const { TwistyPlayer } = await import("cubing/twisty");
        if (cancelled || !container) return;
        const player = new TwistyPlayer({
          puzzle: "3x3x3",
          alg,
          experimentalSetupAlg: withViewRotation(scramble),
          background: "none",
          controlPanel: "none",
          hintFacelets: "none",
          experimentalDragInput: "none",
          tempoScale,
        });
        player.style.width = "100%";
        player.style.height = "100%";
        container.appendChild(player);
        playerRef.current = player;
      })();
      return () => {
        cancelled = true;
        if (playerRef.current && container?.contains(playerRef.current)) {
          container.removeChild(playerRef.current);
        }
        playerRef.current = null;
      };
      // A fresh player per selection/tempo change is simpler and cheap enough
      // here (unlike CubeViewer, which updates alg in place to avoid
      // rebuilding during interactive scrubbing) — this view only rebuilds
      // when you pick a different solve, not every animation frame.
    }, [alg, scramble, tempoScale]);

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.play(),
      reset: () => playerRef.current?.jumpToStart(),
    }));

    return <div ref={containerRef} className="h-full w-full" />;
  },
);
ReplayCube.displayName = "ReplayCube";

function solveLabel(solve: Solve): string {
  const ms = solveFinalMs(solve);
  const date = new Date(solve.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${ms === null ? "DNF" : formatTime(ms)} · ${date}`;
}

function moveCount(reconstruction: string): number {
  return reconstruction.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Plays back two saved solves side by side, synced to a single "go" — a
 * race replay that doesn't need a live opponent or any hardware, since it
 * works off reconstructions already saved from the Analyzer (see
 * AnalyzerView's "Save to solve"). Each cube's turning speed is scaled
 * relative to the other's actual turns-per-second (lib/analysis/replayTempo.ts),
 * so the side that really moved faster visibly moves faster here too.
 */
export function DualReplay() {
  const solves = useSessionStore((s) => s.solves);
  const candidates = useMemo(
    () => solves.filter((s) => s.reconstruction && s.reconstruction.trim() !== "" && solveFinalMs(s) !== null),
    [solves],
  );

  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  // Default to the two most recent solves-with-reconstruction until the
  // user actually picks something — derived directly from `candidates`
  // rather than seeded via an effect, so there's no separate "sync the
  // default in" render pass to get out of order with the user's own choice.
  const effectiveLeftId = leftId || (candidates[candidates.length - 1]?.id ?? "");
  const effectiveRightId = rightId || (candidates[candidates.length - 2]?.id ?? "");

  const left = candidates.find((s) => s.id === effectiveLeftId) ?? null;
  const right = candidates.find((s) => s.id === effectiveRightId) ?? null;

  const leftRef = useRef<ReplayCubeHandle>(null);
  const rightRef = useRef<ReplayCubeHandle>(null);

  const tempo = useMemo(() => {
    if (!left || !right) return { a: 1, b: 1 };
    return relativeTempoScales(
      moveCount(left.reconstruction!),
      solveFinalMs(left)!,
      moveCount(right.reconstruction!),
      solveFinalMs(right)!,
    );
  }, [left, right]);

  const playBoth = () => {
    leftRef.current?.reset();
    rightRef.current?.reset();
    requestAnimationFrame(() => {
      leftRef.current?.play();
      rightRef.current?.play();
    });
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Film size={15} className="text-accent" />
          Dual replay
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Race two of your own solves against each other, side by side, synced to a shared start — great for seeing
          exactly where a slow solve lost time against a fast one.
        </p>

        {candidates.length < 2 ? (
          <p className="text-xs text-muted-2">
            Needs at least two solves with a saved reconstruction. Analyze a solve (Analyze tab) and use &ldquo;Save
            to solve&rdquo; to add one — do that for a couple of solves and they&apos;ll show up here.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <select
                value={effectiveLeftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="min-w-0 rounded-lg bg-bg-panel-2 px-2 py-1.5 text-xs outline-none"
              >
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {solveLabel(s)}
                  </option>
                ))}
              </select>
              <select
                value={effectiveRightId}
                onChange={(e) => setRightId(e.target.value)}
                className="min-w-0 rounded-lg bg-bg-panel-2 px-2 py-1.5 text-xs outline-none"
              >
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {solveLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="h-44 rounded-lg bg-bg-panel-2/40 sm:h-56">
                {left && <ReplayCube ref={leftRef} scramble={left.scramble} alg={left.reconstruction!} tempoScale={tempo.a} />}
              </div>
              <div className="h-44 rounded-lg bg-bg-panel-2/40 sm:h-56">
                {right && (
                  <ReplayCube ref={rightRef} scramble={right.scramble} alg={right.reconstruction!} tempoScale={tempo.b} />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={playBoth}
              disabled={!left || !right}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-semibold text-accent-fg",
                (!left || !right) && "opacity-40",
              )}
            >
              <Play size={13} /> Play together
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-2">
              Turning speed is tempo-matched to each solve&apos;s actual turns-per-second, not real-time duration.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
