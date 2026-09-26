"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dna, Loader2, Pause, Play, Share2 } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeDnaAxes, MIN_SOLVES_FOR_DNA } from "@/lib/stats/dna";
import { buildDnaTimeline, compareSnapshots, morphAxes } from "@/lib/stats/dnaTimeline";
import { drawDnaCard, drawDnaTimelineCard } from "@/lib/share/dnaCard";
import { canvasToBlob } from "@/lib/share/shareCard";
import { RadarChart } from "./RadarChart";
import { cn } from "@/lib/utils/cn";

const STEP_MS = 1400;

async function sharePoster(canvas: HTMLCanvasElement, name: string, title: string) {
  const blob = await canvasToBlob(canvas);
  if (!blob) return;
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A solver's "DNA": a radar chart built entirely from ratios against their
 * own personal bests (see lib/stats/dna.ts) — and, in the Evolution view,
 * the same fingerprint month by month (or week by week), played back as a
 * morphing shape with the previous period ghosted behind, the trait that
 * defined each stretch, and what changed since.
 */
export function CubeDnaCard() {
  const solves = useSessionStore((s) => s.solves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"now" | "evolution">("now");
  const sessionName = sessions.find((s) => s.id === activeSessionId)?.name ?? "Session";

  const axes = useMemo(() => computeDnaAxes(solves), [solves]);
  const timeline = useMemo(() => buildDnaTimeline(solves), [solves]);
  const [picked, setPicked] = useState<number | null>(null);
  const index = Math.min(picked ?? timeline.length - 1, timeline.length - 1);
  const [playing, setPlaying] = useState(false);
  const [morph, setMorph] = useState<{ from: number; t: number } | null>(null);
  const raf = useRef(0);

  // Playback: morph snapshot → snapshot from the first to the latest.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const tick = (now: number) => {
      const pos = (now - start) / STEP_MS;
      const from = Math.floor(pos);
      if (from >= timeline.length - 1) {
        setMorph(null);
        setPicked(timeline.length - 1);
        setPlaying(false);
        return;
      }
      setMorph({ from, t: Math.min(1, (pos - from) * 1.6) });
      setPicked(from);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, timeline.length]);

  const snap = timeline[index];
  const prev = index > 0 ? timeline[index - 1] : null;
  const shownAxes = morph && timeline[morph.from + 1] ? morphAxes(timeline[morph.from].axes, timeline[morph.from + 1].axes, morph.t) : (snap?.axes ?? []);
  const evolution = snap && prev ? compareSnapshots(prev, snap) : null;
  const overall = timeline.length >= 2 ? compareSnapshots(timeline[0], timeline[timeline.length - 1]) : null;

  const onShare = async () => {
    setBusy(true);
    try {
      if (view === "evolution" && timeline.length >= 2) {
        await sharePoster(drawDnaTimelineCard({ sessionName, snapshots: timeline, headline: overall?.headline ?? "" }), "cube-dna-evolution.png", "My Cube DNA evolution");
      } else {
        await sharePoster(drawDnaCard({ sessionName, axes }), "cube-dna.png", "My Cube DNA");
      }
    } catch {
      // A cancelled share sheet throws — nothing to surface to the user.
    } finally {
      setBusy(false);
    }
  };

  if (solves.length < MIN_SOLVES_FOR_DNA) {
    return (
      <div className="card rounded-xl p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Dna size={14} className="text-accent" />
          Cube DNA
        </h3>
        <p className="text-xs text-muted-2">
          {MIN_SOLVES_FOR_DNA - solves.length} more solve{MIN_SOLVES_FOR_DNA - solves.length === 1 ? "" : "s"} and your
          fingerprint unlocks.
        </p>
      </div>
    );
  }

  const canEvolve = timeline.length >= 2;
  return (
    <div className="card animate-fade-in-up rounded-xl p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Dna size={14} className="text-accent" />
          Cube DNA
        </h3>
        <div className="flex items-center gap-1.5">
          {canEvolve && (
            <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-[11px]">
              {(
                [
                  ["now", "Now"],
                  ["evolution", "Evolution"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={cn("px-2.5 py-1 font-medium", view === id ? "bg-accent-soft text-accent" : "text-muted")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void onShare()}
            disabled={busy}
            className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-accent disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
            Poster
          </button>
        </div>
      </div>

      {view === "now" || !canEvolve || !snap ? (
        <>
          <p className="mb-2 text-[11px] text-muted-2">
            Every axis is a ratio against your own personal best — 100 means your average already matches your peak.
          </p>
          <RadarChart axes={axes} ghost={canEvolve ? timeline[timeline.length - 2].axes : null} className="mx-auto w-full max-w-[260px]" />
          {canEvolve && <p className="text-center text-[10px] text-muted-2">Dashed: {timeline[timeline.length - 2].label}</p>}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <p className="text-base font-bold text-foreground">{snap.trait.name}</p>
              <p className="text-[11px] text-muted">
                {snap.label} · {snap.count} solves{snap.meanMs !== null ? ` · avg ${(snap.meanMs / 1000).toFixed(2)}s` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                cancelAnimationFrame(raf.current);
                setMorph(null);
                setPlaying((p) => !p);
              }}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Pause" : "Play"}
            </button>
          </div>
          <RadarChart axes={shownAxes} ghost={morph ? timeline[morph.from].axes : (prev?.axes ?? null)} className="mx-auto w-full max-w-[260px]" />
          <p className="text-center text-[11px] text-muted">{snap.trait.line}</p>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {timeline.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setMorph(null);
                  setPicked(i);
                }}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", i === index ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Sparkline values={timeline.map((s) => s.meanMs)} active={index} />
          {evolution && !playing && (
            <div className="flex flex-col gap-1 rounded-lg bg-bg-panel-2 p-2.5">
              <p className="text-[11px] font-medium text-foreground">{evolution.headline}</p>
              <div className="flex flex-wrap gap-1">
                {evolution.changes
                  .filter((c) => Math.abs(c.delta) >= 1)
                  .map((c) => (
                    <span key={c.label} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", c.delta > 0 ? "bg-success/15 text-success" : "bg-danger/10 text-danger")}>
                      {c.label} {c.delta > 0 ? "+" : ""}
                      {Math.round(c.delta)}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Average time per period — lower times sit higher, so improving reads as climbing. */
function Sparkline({ values, active }: { values: (number | null)[]; active: number }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const W = 240;
  const H = 40;
  const x = (i: number) => 6 + (i / (values.length - 1)) * (W - 12);
  const y = (v: number) => 6 + (hi === lo ? (H - 12) / 2 : ((v - lo) / (hi - lo)) * (H - 12));
  const pts = values.flatMap((v, i) => (v === null ? [] : [`${x(i)},${y(v)}`])).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average time by period">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) =>
        v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === active ? 4 : 2.25} fill={i === active ? "var(--accent)" : "var(--muted-2)"} />,
      )}
    </svg>
  );
}
