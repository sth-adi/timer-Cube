"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSmartCubeStore, type SmartCubeMove } from "@/lib/store/smartCubeStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { MIMIC_STABLE_MS, faceletsOf, fixAfter, mimicAlg, mimicSyncVerdict, mimicView, movesToReach, type MimicFix } from "@/lib/analysis/mimicSync";
import { cn } from "@/lib/utils/cn";

const loadCubeViewerModule = () => import("@/components/scramble/CubeViewer");

/**
 * What the box shows until the 3D viewer is ready — and instead of it if cubing.js can't load: a
 * flat net of the cube, so the card is never empty. The mimic provides the facelets (what it is
 * about to draw) through this context, since a `dynamic` loading component takes no props.
 */
const SkeletonFacelets = createContext<string | null>(null);

function MimicNet() {
  const facelets = useContext(SkeletonFacelets);
  const live = useSmartCubeStore((s) => s.liveFacelets);
  return (
    <div className="flex w-full justify-center" aria-hidden="true">
      <FaceletNet facelets={facelets ?? live} className="w-full max-w-[10rem]" />
    </div>
  );
}

const CubeViewer = dynamic(() => loadCubeViewerModule().then((m) => m.CubeViewer), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <MimicNet />
    </div>
  ),
});

/**
 * Starts downloading the 3D viewer (the wrapper and cubing.js itself) without
 * rendering anything. Call it ahead of the first mimic render — the connect
 * flow does, on the tap — so the module isn't fetched in the middle of
 * inspection, which is exactly when the mimic first mounts. Safe to call
 * repeatedly and on the server (a no-op there).
 */
export function preloadCubeViewer(): void {
  if (typeof window === "undefined") return;
  void loadCubeViewerModule()
    .then((m) => m.loadCubing())
    .catch(() => {});
}

/**
 * Where the tick sits for each face: on the matching edge of the box (the
 * view has yellow on top, so these are the sides you'd expect). F and B have
 * no edge of their own in a three-quarter view, so they take a bottom-left
 * and top-right corner.
 */
const TICK_POSITION: Record<string, string> = {
  U: "left-1/4 right-1/4 top-0 h-[3px]",
  D: "left-1/4 right-1/4 bottom-0 h-[3px]",
  L: "left-0 top-1/4 bottom-1/4 w-[3px]",
  R: "right-0 top-1/4 bottom-1/4 w-[3px]",
  F: "bottom-0 left-0 h-[3px] w-1/5",
  B: "right-0 top-0 h-[3px] w-1/5",
};

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
      className={cn("pointer-events-none absolute rounded-full opacity-0 motion-reduce:hidden", TICK_POSITION[face])}
      style={{ background: FACELET_COLORS[face], boxShadow: `0 0 6px ${FACELET_COLORS[face]}` }}
    />
  );
}

/**
 * Live 3D mirror of the physical smart cube: the scramble is the viewer's
 * setup and every move reported so far rides on top of it (`liveMoves`). The
 * viewer folds the earlier moves into its setup incrementally and plays only
 * the newest turn — a short quarter-turn animation, no re-parse of the whole
 * move list — so each turn visibly rotates and the cube is never more than
 * one ~80ms animation behind the physical one. When the list isn't simply
 * appended to (a new scramble, a correction, a rewind) it rebuilds the
 * position instantly instead, and under prefers-reduced-motion it always does.
 * One persistent player instance is reused throughout; it never remounts.
 *
 * The turns alone can drift from the real cube: when one is lost over
 * Bluetooth the store corrects its own state from the cube's report but the
 * recorded turns stay as they were. So once the store's facelets have
 * disagreed with what the mimic shows, unchanged, for a moment (and the
 * reports aren't flagged unreliable), the corrective moves are worked out on
 * the cube-engine worker and become the viewer's new setup — a snap, no
 * animation — with later turns riding on top as before. See mimicSync.ts.
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
  const tickFace = lastFace !== null && lastFace in TICK_POSITION ? lastFace : null;

  return (
    <div className={cn("relative", className)}>
      <SkeletonFacelets.Provider value={expected}>
        <CubeViewer alg="" setupAlg={setupAlg} liveMoves={liveMoves} className="h-full w-full" fallback={<MimicNet />} />
      </SkeletonFacelets.Provider>
      {tickFace && <TurnTick key={tokens.length} face={tickFace} />}
    </div>
  );
}
