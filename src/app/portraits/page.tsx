"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, Play as PlayIcon } from "lucide-react";
import { FACE_HEX, PlayShell, TurnPad } from "@/components/play/PlayShell";
import { PHASE_INK, fitTransform, portrait, type Portrait } from "@/lib/play/portrait";
import { usePlayInput } from "@/lib/play/usePlayInput";
import { useSessionStore } from "@/lib/store/sessionStore";
import { analyzableSolves, solveMetrics } from "@/lib/analytics/solveMetrics";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { Solve } from "@/types";

const ACCENT = "#b36bff";
const PHASE_NAMES = ["Cross", "F2L", "OLL", "PLL"];

interface Piece {
  solve: Solve;
  art: Portrait;
  tps: number;
}

type ColorOf = (i: number) => string;

/** Draws a portrait into a canvas, up to `progress` (0..1) of the way through the solve, glowing. */
function paint(c: HTMLCanvasElement | null, art: Portrait, progress: number, colorOf: ColorOf, pad = 0.08, bg = "#08060f") {
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  const { scale, ox, oy } = fitTransform(art.bounds, c.width, c.height, pad);
  const unit = Math.max(0.6, Math.min(c.width, c.height) / 320);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    art.segs.forEach((s, i) => {
      if (s.t > progress) return;
      ctx.strokeStyle = colorOf(i);
      ctx.globalAlpha = pass === 0 ? 0.22 : 0.9;
      ctx.lineWidth = s.w * unit * (pass === 0 ? 4.5 : 1.4);
      ctx.beginPath();
      ctx.moveTo(s.x1 * scale + ox, s.y1 * scale + oy);
      ctx.lineTo(s.x2 * scale + ox, s.y2 * scale + oy);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function phaseColor(art: Portrait): ColorOf {
  return (i) => PHASE_INK[art.segs[i].phase];
}

function Thumb({ piece, active, onClick }: { piece: Piece; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(ref.current, piece.art, 1, phaseColor(piece.art), 0.1), [piece]);
  return (
    <button type="button" onClick={onClick} className={cn("group flex flex-col gap-1 rounded-xl p-1 text-left transition-colors", active ? "bg-white/10" : "hover:bg-white/5")}>
      <canvas ref={ref} width={180} height={180} className={cn("aspect-square w-full rounded-lg", active && "play-glow")} />
      <span className="px-1 text-[11px] font-bold tabular-nums">{formatTime(piece.solve.timeMs)}</span>
    </button>
  );
}

async function downloadPoster(piece: Piece) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const art = document.createElement("canvas");
  art.width = W;
  art.height = W;
  paint(art, piece.art, 1, phaseColor(piece.art), 0.1);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#08060f";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(art, 0, 0);
  ctx.fillStyle = "#f4f1ff";
  ctx.font = "900 96px system-ui, sans-serif";
  ctx.fillText(formatTime(piece.solve.timeMs), 72, W + 110);
  ctx.fillStyle = "#8d88a8";
  ctx.font = "500 30px system-ui, sans-serif";
  const d = new Date(piece.solve.date);
  ctx.fillText(`${d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · ${piece.art.segs.length} turns · ${piece.tps.toFixed(1)} TPS`, 74, W + 160);
  let x = 74;
  ctx.font = "700 28px system-ui, sans-serif";
  PHASE_NAMES.forEach((name, i) => {
    ctx.fillStyle = PHASE_INK[i];
    ctx.beginPath();
    ctx.arc(x + 10, W + 212, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(name, x + 30, W + 222);
    x += ctx.measureText(name).width + 70;
  });
  ctx.fillStyle = "#5d5a73";
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText("Solve Portrait", W - 250, W + 222);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `solve-portrait-${formatTime(piece.solve.timeMs).replace(/[:.]/g, "-")}.png`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Solve Portraits: every smart-cube solve, drawn as a piece of generative
 * art (lib/play/portrait.ts) — one stroke per turn, each face swinging the
 * pen its own way, pauses shooting out long strokes, each phase its own
 * ink. The same solve always draws the same; no two solves draw alike.
 */
export default function PortraitsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [];
    for (const solve of analyzableSolves(allSolves).reverse()) {
      const m = solveMetrics(solve);
      const moves = solve.reconstruction!.split(/\s+/).filter(Boolean);
      const art = portrait(moves, solve.moveTimestamps!, m ? m.phaseEnds.slice(0, 3) : []);
      out.push({ solve, art, tps: m?.tps ?? moves.length / (solve.timeMs / 1000) });
    }
    return out;
  }, [allSolves]);
  const [mode, setMode] = useState<"gallery" | "sketch">("gallery");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shown, setShown] = useState(24);
  const [sort, setSort] = useState<"recent" | "fastest">("recent");
  const sorted = useMemo(() => (sort === "recent" ? pieces : [...pieces].sort((a, b) => a.solve.timeMs - b.solve.timeMs)), [pieces, sort]);
  const selected = sorted.find((p) => p.solve.id === selectedId) ?? sorted[0] ?? null;

  return (
    <PlayShell accent={ACCENT} title="Solve Portraits" tagline="Every solve you've done, drawn as its own piece of art. Each face swings the pen its own way, pauses shoot out long strokes, and each phase has its own ink." wide>
      <div className="flex gap-1 self-start rounded-full bg-white/[0.05] p-1">
        {(["gallery", "sketch"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-full px-4 py-1.5 text-[12px] font-bold", mode === m ? "bg-[var(--play-accent)] text-black" : "text-[var(--play-dim)]")}>
            {m === "gallery" ? "Your solves" : "Live sketch"}
          </button>
        ))}
      </div>
      {mode === "sketch" ? (
        <Sketch />
      ) : !selected ? (
        <div className="play-panel rounded-2xl p-6 text-center text-sm text-[var(--play-dim)]">
          Portraits are drawn from smart-cube solves (every turn and its timing). Do a solve on a connected cube and it appears here — or try Live sketch to draw with your turns right now.
        </div>
      ) : (
        <>
          <Featured piece={selected} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--play-dim)]">{pieces.length} portraits</span>
            <div className="flex gap-1">
              {(["recent", "fastest"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSort(s)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", sort === s ? "bg-white/10 text-white" : "text-[var(--play-dim)]")}>
                  {s === "recent" ? "Recent" : "Fastest"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {sorted.slice(0, shown).map((p) => (
              <Thumb key={p.solve.id} piece={p} active={p === selected} onClick={() => setSelectedId(p.solve.id)} />
            ))}
          </div>
          {shown < sorted.length && (
            <button type="button" onClick={() => setShown((n) => n + 24)} className="self-center rounded-full border border-white/10 px-4 py-2 text-[12px] font-semibold text-[var(--play-dim)]">
              Show more
            </button>
          )}
        </>
      )}
    </PlayShell>
  );
}

function Featured({ piece }: { piece: Piece }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    // Draws itself on at the solve's real pace (capped so long solves don't drag).
    const total = Math.min(6000, Math.max(1500, piece.solve.timeMs));
    const t0 = performance.now();
    let raf = 0;
    const colorOf = phaseColor(piece.art);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      paint(ref.current, piece.art, p, colorOf);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [piece, run]);
  const d = new Date(piece.solve.date);
  return (
    <div className="play-panel flex flex-col gap-3 rounded-2xl p-3 sm:flex-row">
      <canvas ref={ref} width={720} height={720} className="aspect-square w-full rounded-xl sm:w-[60%]" />
      <div className="flex flex-col gap-3 px-1 sm:justify-between sm:py-2">
        <div>
          <p className="text-4xl font-black tabular-nums">{formatTime(piece.solve.timeMs)}</p>
          <p className="text-[12px] text-[var(--play-dim)]">
            {d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {piece.art.segs.length} turns · {piece.tps.toFixed(1)} TPS
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {PHASE_NAMES.map((n, i) => (
            <span key={n} className="flex items-center gap-1.5 text-[11px] font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ background: PHASE_INK[i] }} />
              {n}
            </span>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-[var(--play-dim)]">Tight knots are fast bursts of turning. Long straight strokes are where you stopped to look.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRun((r) => r + 1)} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-[12px] font-semibold">
            <PlayIcon size={13} /> Redraw
          </button>
          <button type="button" onClick={() => void downloadPoster(piece)} className="play-btn flex items-center gap-1.5 px-4 py-2 text-[12px]">
            <Download size={13} /> Poster PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function Sketch() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [turns, setTurns] = useState<{ moves: string[]; times: number[]; faces: string[] }>({ moves: [], times: [], faces: [] });
  const t0 = useRef<number | null>(null);
  const { press, connected } = usePlayInput((t) => {
    const now = performance.now();
    t0.current ??= now;
    const at = now - t0.current;
    setTurns((s) => ({ moves: [...s.moves, t.grip], times: [...s.times, at], faces: [...s.faces, t.physical[0]] }));
  });
  const art = useMemo(() => portrait(turns.moves, turns.times), [turns]);
  useEffect(() => {
    if (!turns.moves.length) {
      paint(ref.current, art, 1, () => "#fff");
      return;
    }
    paint(ref.current, art, 1, (i) => FACE_HEX[turns.faces[i]] ?? "#fff", 0.12);
  }, [art, turns]);

  return (
    <div className="flex flex-col gap-3">
      <div className="play-panel relative rounded-2xl p-3">
        <canvas ref={ref} width={720} height={720} className="aspect-square w-full rounded-xl" />
        {!turns.moves.length && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-lg font-black">Draw with your cube</p>
            <p className="max-w-[16rem] text-[12px] text-[var(--play-dim)]">Every turn is a stroke, in the color of the face you turned. Turn fast for curls, wait for long lines.</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[var(--play-dim)]">{turns.moves.length} strokes</span>
        <button
          type="button"
          onClick={() => {
            t0.current = null;
            setTurns({ moves: [], times: [], faces: [] });
          }}
          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold"
        >
          <Eraser size={13} /> Clear
        </button>
      </div>
      {!connected && <TurnPad onTurn={press} />}
    </div>
  );
}
