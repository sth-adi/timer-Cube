"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSmartCubeStore, type SmartCubeMove } from "@/lib/store/smartCubeStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { tickPositionClass } from "@/components/timer/tickPlacement";
import { MIMIC_STABLE_MS, faceletsOf, fixAfter, mimicAlg, mimicSyncVerdict, mimicView, movesToReach, type MimicFix } from "@/lib/analysis/mimicSync";
import { TurnCube } from "@/components/lab/TurnCube";
import { TwinStage } from "@/components/lab/TwinStage";
import { useTurnAnimation } from "@/components/lab/useTurnAnimation";
import { useProgressFills } from "@/components/lab/useProgressFills";
import { cn } from "@/lib/utils/cn";

/**
 * Kept so the connect flow's tap handler still compiles. The mimic is plain CSS 3D now (the same layer-turning
 * cube as the Gyro Twin), so there is nothing to download ahead of inspection any more.
 */
export function preloadCubeViewer(): void {}

/** The camera: yellow on top, green in front, a little above and to the left (red shows on the left side), as the mimic has always been held. */
const MIMIC_CAMERA = "rotateX(-24deg) rotateY(32deg)";
/** The cube turned over (z2) so yellow is up, inside the camera. */
const YELLOW_UP = "rotateZ(180deg)";

/**
 * A short, face-coloured mark on the edge of the box that fades out — keyed
 * by the move count so each landed turn mounts a fresh one. Decorative only
 * (the cube itself turns; there is no information here a screen reader would
 * need), and skipped entirely under prefers-reduced-motion.
 */
function TurnTick({ face }: { face: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const anim = el.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 320, easing: "ease-out", fill: "forwards" });
    return () => anim.cancel();
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full opacity-0 motion-reduce:hidden", tickPositionClass(face))}
      style={{ background: FACELET_COLORS[face] }}
    />
  );
}

/**
 * Live 3D mirror of the physical smart cube: the scramble plus every move reported so far, drawn as the
 * same layer-turning CSS cube the Gyro Twin uses. Each turn the cube reports plays as that layer swinging
 * round (timed by the real gap since the previous move, queued in order, sped up when they pile up; see
 * useTurnAnimation), and anything that is not one clean face turn (a new scramble, a correction, a rewind,
 * a slice) snaps, as does everything under prefers-reduced-motion. One cube instance is reused throughout;
 * it never remounts.
 *
 * The turns alone can drift from the real cube: when one is lost over
 * Bluetooth the store corrects its own state from the cube's report but the
 * recorded turns stay as they were. So once the store's facelets have
 * disagreed with what the mimic shows, unchanged, for a moment (and the
 * reports aren't flagged unreliable), the corrective moves are worked out on
 * the cube-engine worker and become the mimic's new setup, a snap with no
 * animation, with later turns riding on top as before. See mimicSync.ts.
 *
 * While it shows the cuber's own live solve (the moves are the store's, and a solve is armed or recording) the
 * pieces of the current stage not yet home are drawn a little dimmed, so the cube fills in as the cross, each
 * F2L pair, OLL and PLL land (see useProgressFills); a mimic of someone else's turns never does.
 *
 * Each landed turn also lights a small tick in that face's colour on the
 * matching edge of the box, so a turn reads as *caught* the instant it
 * happens even before the animation has visibly moved.
 */
export function LiveCubeMimic({
  scramble,
  moves,
  className,
  idle = false,
}: {
  scramble: string;
  moves: readonly SmartCubeMove[];
  className?: string;
  /**
   * Keep the player mounted but at rest: it shows `scramble` as it is, and the sync with the cube's own
   * state (below) is paused. The live timer holds the mimic this way between solves, so the next
   * attempt starts with a ready player and only has to move the turns in — the same instance, never rebuilt.
   */
  idle?: boolean;
}) {
  const tokens = useMemo(() => moves.map((m) => m.token), [moves]);
  // True for the cuber's own live solve: these are the store's own moves, and a solve is running.
  const ownSolveLive = useSmartCubeStore((s) => (s.armed || s.recording) && s.moves === moves);
  const liveFacelets = useSmartCubeStore((s) => s.liveFacelets);
  const unreliable = useSmartCubeStore((s) => s.faceletsUnreliable);
  const [fix, setFix] = useState<MimicFix | null>(null);
  // A correction belongs to one attempt; an idle mimic drops it so the next one starts from its scramble.
  if (idle && fix) setFix(null);
  const { setupAlg, liveMoves } = useMemo(() => mimicView(scramble, tokens, fix), [scramble, tokens, fix]);
  const shownAlg = useMemo(() => mimicAlg(setupAlg, liveMoves), [setupAlg, liveMoves]);
  const expected = useMemo(() => {
    try {
      return faceletsOf(shownAlg);
    } catch {
      return null;
    }
  }, [shownAlg]);
  // "wait": the cube's state differs from the mimic's and can be believed — the timer below decides whether it stays that way.
  const verdict = idle || expected === null ? "agree" : mimicSyncVerdict({ expected, facelets: liveFacelets, unreliable, stableForMs: 0 });
  useEffect(() => {
    if (verdict !== "wait" || expected === null) return;
    let cancelled = false;
    // Any change to the turns, the facelets or the reliability flag re-runs this effect, restarting the wait.
    const timer = setTimeout(() => {
      if (mimicSyncVerdict({ expected, facelets: liveFacelets, unreliable, stableForMs: MIMIC_STABLE_MS }) !== "correct") return;
      const client = getCubeEngineClient();
      movesToReach(shownAlg, liveFacelets, (target, actual) => client.computeCorrectiveMoves(target, actual))
        .then((corrective) => {
          if (!cancelled) setFix(fixAfter(scramble, tokens, shownAlg, corrective));
        })
        .catch(() => {});
    }, MIMIC_STABLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [verdict, expected, shownAlg, liveFacelets, unreliable, scramble, tokens]);
  const lastFace = tokens.length > 0 ? tokens[tokens.length - 1][0] : null;
  // Slice and whole-cube moves have no face colour to show, so they get no tick.
  const tickFace = lastFace !== null && tickPositionClass(lastFace) !== null ? lastFace : null;

  // The facelets to draw: what the alg works out to (the cube's own report only if that alg can't be parsed).
  const turnView = useTurnAnimation(expected ?? liveFacelets);
  // The cube is drawn in px, so it takes its size from the box it is given (the stage is 1.9 cubes across).
  const boxRef = useRef<HTMLDivElement>(null);
  const [cubeSize, setCubeSize] = useState(0);
  const progressFills = useProgressFills(turnView.facelets, ownSolveLive && !idle, cubeSize);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCubeSize(Math.max(0, Math.round(Math.min(width, height) / 1.8)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className={cn("relative flex items-center justify-center", className)} data-testid="mimic-cube">
      {cubeSize > 0 && (
        <TwinStage size={cubeSize}>
          <div className="relative" style={{ width: cubeSize, height: cubeSize, transformStyle: "preserve-3d", transform: `${MIMIC_CAMERA} ${YELLOW_UP}` }}>
            <TurnCube facelets={turnView.facelets} turning={turnView.turning} size={cubeSize} stickerFills={progressFills} />
          </div>
        </TwinStage>
      )}
      {tickFace && <TurnTick key={tokens.length} face={tickFace} />}
    </div>
  );
}
