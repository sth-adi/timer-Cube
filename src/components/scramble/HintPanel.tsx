"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("./CubeViewer").then((m) => m.CubeViewer), { ssr: false });

function MoveList({ moves }: { moves: string[] }) {
  if (moves.length === 0) return <span className="text-muted italic">already solved</span>;
  return <span className="tabular-timer">{moves.join(" ")}</span>;
}

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

  const [tab, setTab] = useState<"cross" | "cfop">("cross");
  const [previewAlg, setPreviewAlg] = useState("");

  if (!hintSolverEnabled) return null;

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

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onReveal}
        className="flex items-center gap-1.5 text-xs text-muted-2 hover:text-muted transition-colors"
      >
        {hintVisible ? <EyeOff size={13} /> : <Eye size={13} />}
        {hintVisible ? "hide solve hints" : "solve hints"}
      </button>

      {hintVisible && (
        <div className="glass-panel animate-fade-in-up w-full max-w-xl rounded-2xl p-4 text-sm">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => onTab("cross")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === "cross" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
              )}
            >
              Best Cross
            </button>
            <button
              type="button"
              onClick={() => onTab("cfop")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
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
                onClick={() => setPreviewAlg(`${scramble} ${crossHint.join(" ")}`)}
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
                  onClick={() => setPreviewAlg(`${scramble} ${cfopHint.cross.join(" ")}`)}
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
                onClick={() => setPreviewAlg(`${scramble} ${cfopHint.full.join(" ")}`)}
              >
                Preview full solve →
              </button>
            </div>
          )}

          {previewAlg && (
            <div className="mt-3 h-56 rounded-xl overflow-hidden border border-border">
              <CubeViewer alg={previewAlg} controlPanel="bottom-row" className="h-full w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
