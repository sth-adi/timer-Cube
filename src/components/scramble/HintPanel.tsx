"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { cn } from "@/lib/utils/cn";
import type { CubeViewerHandle } from "./CubeViewer";

const CubeViewer = dynamic(() => import("./CubeViewer").then((m) => m.CubeViewer), { ssr: false });

function MoveList({ moves }: { moves: string[] }) {
  if (moves.length === 0) return <span className="text-muted italic">already solved</span>;
  return <span className="tabular-timer">{moves.join(" ")}</span>;
}

type PreviewKind = "cross" | "cfop-cross" | "cfop-full" | null;

export function HintPanel() {
  const hintSolverEnabled = useSettingsStore((s) => s.hintSolverEnabled);
  const hintVisible = useScrambleStore((s) => s.hintVisible);
  const toggleHintVisible = useScrambleStore((s) => s.toggleHintVisible);
  const loadCrossHint = useScrambleStore((s) => s.loadCrossHint);
  const loadCfopHint = useScrambleStore((s) => s.loadCfopHint);
  const crossHint = useScrambleStore((s) => s.crossHint);
  const cfopHint = useScrambleStore((s) => s.cfopHint);
  const hintLoading = useScrambleStore((s) => s.hintLoading);
  const hintError = useScrambleStore((s) => s.hintError);
  const scramble = useScrambleStore((s) => s.scramble);
  const event = useScrambleStore((s) => s.event);

  const [tab, setTab] = useState<"cross" | "cfop">("cross");
  const [previewKind, setPreviewKind] = useState<PreviewKind>(null);
  const previewHandleRef = useRef<CubeViewerHandle | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const onPreviewReady = useCallback((handle: CubeViewerHandle) => {
    previewHandleRef.current = handle;
    handle.onPlayingChange(setPreviewPlaying);
  }, []);

  // Cross/CFOP solving only exists for 3x3 — no hints for other puzzle sizes.
  if (!hintSolverEnabled || event !== "333") return null;

  const onReveal = () => {
    toggleHintVisible();
    if (!hintVisible) {
      if (tab === "cross") void loadCrossHint();
      else void loadCfopHint();
    }
  };

  const onTab = (t: "cross" | "cfop") => {
    setTab(t);
    if (t === "cross") void loadCrossHint();
    else void loadCfopHint();
  };

  // Derived, not stored: once the scramble moves on, crossHint/cfopHint are
  // cleared by the store, so this naturally goes back to null — no need to
  // separately track "is this preview stale" anywhere.
  const previewMoves =
    previewKind === "cross"
      ? crossHint
      : previewKind === "cfop-cross"
        ? (cfopHint?.cross ?? null)
        : previewKind === "cfop-full"
          ? (cfopHint?.full ?? null)
          : null;

  return (
    // select-none (+ the webkit callout suppression) keeps this text from
    // getting swept into a long-press text-selection gesture on mobile —
    // this panel sits directly under the timer, whose own hold-to-start
    // press is itself a long touch, so without this a thumb that lands a
    // little low here triggers the browser's native selection UI instead
    // of starting the timer, and the eventual touchend never reaches it.
    <div className="flex flex-col items-center gap-3 select-none [-webkit-touch-callout:none]">
      <button
        type="button"
        onClick={onReveal}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted-2 hover:text-muted hover:bg-bg-panel-2 transition-colors"
      >
        {hintVisible ? <EyeOff size={13} /> : <Eye size={13} />}
        {hintVisible ? "hide solve hints" : "solve hints"}
      </button>

      {hintVisible && (
        <div className="card animate-fade-in-up w-full max-w-xl rounded-xl p-4 text-sm">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => onTab("cross")}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-medium transition-colors",
                tab === "cross" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
              )}
            >
              Best Cross
            </button>
            <button
              type="button"
              onClick={() => onTab("cfop")}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-medium transition-colors",
                tab === "cfop" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
              )}
            >
              Full CFOP Solution
            </button>
          </div>

          {hintLoading && (
            <div className="flex items-center gap-2 text-muted py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> solving…
            </div>
          )}

          {hintError && <p className="text-danger text-xs">{hintError}</p>}

          {!hintLoading && tab === "cross" && crossHint && (
            <div className="space-y-2">
              <p className="text-muted-2 text-xs uppercase tracking-wide">
                Optimal cross &middot; {crossHint.length} move{crossHint.length === 1 ? "" : "s"}
              </p>
              <p
                className="cursor-pointer hover:text-accent transition-colors"
                onClick={() => setPreviewKind("cross")}
              >
                <MoveList moves={crossHint} />
              </p>
            </div>
          )}

          {!hintLoading && tab === "cfop" && cfopHint && (
            <div className="space-y-3">
              <p className="text-muted-2 text-xs uppercase tracking-wide">{cfopHint.totalMoves} moves total</p>
              <div>
                <p className="text-accent text-xs font-semibold mb-1">CROSS ({cfopHint.cross.length})</p>
                <p
                  className="cursor-pointer hover:text-accent transition-colors"
                  onClick={() => setPreviewKind("cfop-cross")}
                >
                  <MoveList moves={cfopHint.cross} />
                </p>
              </div>
              <div>
                <p className="text-accent text-xs font-semibold mb-1">F2L</p>
                <ol className="space-y-1">
                  {cfopHint.f2l.map((pair, i) => (
                    <li key={i}>
                      <span className="text-muted-2 mr-1">{pair.pairName}</span>
                      <MoveList moves={pair.moves} />
                    </li>
                  ))}
                </ol>
              </div>
              {cfopHint.lastLayerFallback ? (
                <div>
                  <p className="text-accent text-xs font-semibold mb-1">LAST LAYER ({cfopHint.pll.length})</p>
                  <MoveList moves={cfopHint.pll} />
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-accent text-xs font-semibold mb-1">OLL ({cfopHint.oll.length})</p>
                    <MoveList moves={cfopHint.oll} />
                  </div>
                  <div>
                    <p className="text-accent text-xs font-semibold mb-1">PLL ({cfopHint.pll.length})</p>
                    <MoveList moves={cfopHint.pll} />
                  </div>
                </>
              )}
              <button
                type="button"
                className="text-xs text-muted hover:text-accent transition-colors"
                onClick={() => setPreviewKind("cfop-full")}
              >
                Preview full solve →
              </button>
            </div>
          )}

          {previewMoves !== null && (
            <div className="mt-3">
              <div className="h-56 rounded-xl overflow-hidden border border-border">
                <CubeViewer
                  alg={previewMoves.join(" ")}
                  setupAlg={scramble}
                  onReady={onPreviewReady}
                  className="h-full w-full"
                />
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => previewHandleRef.current?.jumpToStart()}
                  aria-label="Restart"
                  className="tap-target flex items-center justify-center rounded-full bg-bg-panel-2 p-2 text-muted hover:text-foreground"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => previewHandleRef.current?.togglePlay()}
                  className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
                >
                  {previewPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {previewPlaying ? "Pause" : "Play"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
