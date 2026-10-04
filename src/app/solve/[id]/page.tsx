"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Ghost, Loader2, RefreshCw, Timer as TimerIcon, WifiOff } from "lucide-react";
import { fetchSharedSolve, type SharedSolve, type SharedSolveFailure } from "@/lib/social/shareSolve";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { AnalyzeResult } from "@/lib/analysis/analyze";
import { SolveReplay } from "@/components/analysis/SolveReplay";
import { PhaseBreakdownCards } from "@/components/analysis/PhaseBreakdown";
import { FindingsList } from "@/components/analysis/FindingsList";
import { formatTime } from "@/lib/utils/time";
import { WCA_EVENTS, EVENT_TAGS } from "@/types";

type LoadState = "loading" | "ready" | SharedSolveFailure;

/** What each failed lookup says — only "not-found" may blame the link. */
const FAILURE_COPY: Record<SharedSolveFailure, { title: string; body: string }> = {
  "not-found": { title: "This link doesn't match a solve", body: "It may have been mistyped, or the solve was removed." },
  offline: { title: "You're offline", body: "Connect to the internet and try again." },
  timeout: { title: "Couldn't reach the server", body: "The request took too long. Check your connection and try again." },
  error: { title: "Couldn't reach the server", body: "Something went wrong loading this solve. Try again in a moment." },
};

/** Every iOS browser, and desktop Safari — the WebKit engines with the stale-scroll-extent bug the nudge below works around. */
function isWebKitSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return true;
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Android|Edg|OPR/.test(ua);
}

/**
 * A read-only view of one shared solve — no account, no app state, nothing
 * local: everything on screen comes from `fetchSharedSolve` (the raw
 * scramble/reconstruction/time/moveTimestamps a link owner published) plus
 * a fresh `analyzeSolve` run on those same fields, exactly what the
 * analyzer itself does with a solve pulled from local history. See
 * lib/social/shareSolve.ts for why this needs its own Supabase table rather
 * than reusing the private `solves` sync table.
 */
export default function SharedSolvePage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>("loading");
  const [solve, setSolve] = useState<SharedSolve | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const retry = () => {
    setState("loading");
    setSolve(null);
    setResult(null);
    setAttempt((n) => n + 1);
  };

  // This page's content grows in several async steps after the initial,
  // much-shorter "Loading solve…" paint — the fetch resolving, the analysis
  // finishing, the 3D replay's own dynamically-imported player mounting and
  // sizing its canvas. Mobile Safari in particular sometimes never
  // re-evaluates a page's scrollable extent after JS grows its height post
  // paint, leaving a visitor stuck unable to scroll to content that's
  // genuinely there — pinch-zooming (which pans independently of the
  // page's own scroll state) is the giveaway. A tiny, real scroll nudge
  // (not a same-position no-op, which some engines short-circuit) forces a
  // fresh recalculation. Only WebKit has the bug, and only growth can strand
  // content, so other engines are left alone and each distinct height
  // increase nudges once (shrinking or same-height resizes never do).
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined" || !isWebKitSafari()) return;
    let raf = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = entries[entries.length - 1].contentRect.height;
      const grew = height > lastHeight;
      lastHeight = height;
      if (!grew) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        const y = window.scrollY;
        window.scrollTo(window.scrollX, y + 1);
        window.scrollTo(window.scrollX, y);
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await fetchSharedSolve(params.id);
      if (cancelled) return;
      if (!found.ok) {
        setState(found.reason);
        return;
      }
      setSolve(found.solve);
      setState("ready");
      try {
        const client = getCubeEngineClient();
        await client.ready();
        const analyzed = await client.analyzeSolve({
          scramble: found.solve.scramble,
          reconstruction: found.solve.reconstruction,
          timeMs: found.solve.timeMs,
        });
        if (!cancelled) setResult(analyzed);
      } catch {
        // A solve from a puzzle the analyzer can't model (non-3x3, or a
        // hand-edited reconstruction that doesn't match its scramble) still
        // gets the raw scramble/time/moves shown below — just not the
        // phase breakdown, which needs a successful analysis to exist at all.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, attempt]);

  const puzzleLabel = solve ? (WCA_EVENTS.find((e) => e.id === solve.puzzle)?.label ?? solve.puzzle) : null;
  const eventLabel = solve?.event ? EVENT_TAGS.find((e) => e.id === solve.event)?.label : null;
  const phases = result?.ok ? result.phases : [];

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TimerIcon size={16} className="text-accent" />
        Cube
      </Link>

      <div ref={contentRef} className="flex w-full max-w-2xl flex-col gap-3 pb-8">
        {state === "loading" && (
          <div className="card flex flex-col items-center gap-2 rounded-xl p-8">
            <Loader2 size={20} className="animate-spin text-accent" />
            <p className="text-xs text-muted">Loading solve…</p>
          </div>
        )}

        {state !== "loading" && state !== "ready" && (
          <div className="card flex flex-col items-center gap-2 rounded-xl p-8 text-center" role="alert">
            {state === "offline" ? <WifiOff size={20} className="text-danger" /> : <AlertTriangle size={20} className="text-danger" />}
            <p className="text-sm font-medium">{FAILURE_COPY[state].title}</p>
            <p className="max-w-sm text-xs text-muted">{FAILURE_COPY[state].body}</p>
            {state !== "not-found" && (
              <button
                type="button"
                onClick={retry}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg"
              >
                <RefreshCw size={13} /> Retry
              </button>
            )}
          </div>
        )}

        {state === "ready" && solve && (
          <>
            <div className="card rounded-xl p-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                {puzzleLabel && <span className="rounded-full bg-bg-panel-2 px-2 py-0.5 font-medium text-muted">{puzzleLabel}</span>}
                {eventLabel && <span className="rounded-full bg-bg-panel-2 px-2 py-0.5 font-medium text-muted">{eventLabel}</span>}
                {solve.username && <span className="text-muted-2">shared by {solve.username}</span>}
              </div>
              <p className="tabular-timer text-3xl font-bold text-foreground">{formatTime(solve.timeMs)}</p>
              <p className="mt-2 break-words font-mono text-xs leading-relaxed text-muted">{solve.scramble}</p>
              {solve.puzzle === "333" && (
                <Link
                  href={`/rematch?ghost=${encodeURIComponent(params.id)}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg"
                >
                  <Ghost size={13} /> Race this solve as a ghost
                </Link>
              )}
            </div>

            {result === null && (
              <div className="card flex items-center gap-2 rounded-xl p-3 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> Analyzing…
              </div>
            )}

            {result && !result.ok && (
              <div className="card rounded-xl p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-danger">
                  <AlertTriangle size={13} /> Detailed analysis isn&apos;t available for this solve
                </p>
                <p className="mb-2 text-xs text-muted">Here&apos;s the raw reconstruction instead:</p>
                <p className="break-words font-mono text-[11px] leading-relaxed text-foreground/80">{solve.reconstruction}</p>
              </div>
            )}

            {result && result.ok && (
              <>
                <div className="card animate-fade-in-up rounded-xl p-3">
                  <p className="text-sm leading-relaxed">{result.summary}</p>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                    <span>
                      Cross on <span className="text-foreground">{result.crossFace}</span>
                    </span>
                    <span>
                      <span className="text-foreground">{result.metrics.stm}</span> STM ·{" "}
                      <span className="text-foreground">{result.metrics.qtm}</span> QTM ·{" "}
                      <span className="text-foreground">{result.metrics.rotations}</span> rotations
                    </span>
                    {result.tps !== undefined && (
                      <span>
                        <span className="text-foreground">{result.tps.toFixed(1)}</span> TPS
                      </span>
                    )}
                  </div>
                </div>

                <FindingsList findings={result.findings} />

                {phases.length > 0 && (
                  <SolveReplay
                    scramble={result.scramble}
                    phases={phases}
                    moves={result.moves}
                    findings={result.findings}
                    summary={result.summary}
                    moveTimestamps={solve.moveTimestamps ?? undefined}
                    totalMs={solve.timeMs}
                  />
                )}

                <PhaseBreakdownCards phases={phases} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
