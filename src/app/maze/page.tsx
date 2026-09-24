"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Smartphone } from "lucide-react";
import { FACE_HEX, PlayShell, TurnPad } from "@/components/play/PlayShell";
import { usePlayInput, useTilt } from "@/lib/play/usePlayInput";
import { BALL_R, GATE_OPEN_MS, HOLE_R, WALL, generateMaze, levelSpec, solidRects, stepBall, type Ball, type GateColor, type Maze } from "@/lib/play/maze";
import { FACE_COLOR_NAMES } from "@/lib/gyro/orientation";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useStored } from "@/lib/play/useStored";

const ACCENT = "#3de8ff";
const BEST_KEY = "maze-best";

const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Tilt Maze: the cube is the board. Tilt it to roll the marble (gyro cubes;
 * a phone's tilt sensor or the arrow keys stand in otherwise), and turn a
 * face to open the gate of its color for a few seconds — so you're
 * balancing with your wrists and twisting with your fingers at once.
 */
export default function MazePage() {
  const [level, setLevel] = useState(1);
  const [best, setBest] = useStored<Record<number, number>>(BEST_KEY, {});
  // A fresh game per level (and per retry): all its state starts over by remounting.
  const [attempt, setAttempt] = useState(0);
  return (
    <PlayShell accent={ACCENT} title="Tilt Maze" tagline="Your cube is the board. Tilt it to roll the marble; turn a face to open the gate of that color for a few seconds. Mind the holes.">
      <MazeGame
        key={`${level}:${attempt}`}
        level={level}
        setLevel={setLevel}
        retry={() => setAttempt((a) => a + 1)}
        best={best}
        record={(ms) => {
          if (!(best[level] <= ms)) setBest({ ...best, [level]: ms });
        }}
      />
    </PlayShell>
  );
}

function MazeGame({
  level,
  setLevel,
  retry,
  best,
  record,
}: {
  level: number;
  setLevel: (f: (l: number) => number) => void;
  retry: () => void;
  best: Record<number, number>;
  record: (ms: number) => void;
}) {
  const maze = useMemo(() => {
    const spec = levelSpec(level);
    return generateMaze(spec.w, spec.h, level * 7919 + 13, spec.gates, spec.holes);
  }, [level]);
  const [status, setStatus] = useState<"ready" | "rolling" | "won">("ready");
  const [falls, setFalls] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [tiltSource, setTiltSource] = useState<string>("none");
  const canvas = useRef<HTMLCanvasElement>(null);
  const ball = useRef<Ball>({ ...maze.start, vx: 0, vy: 0 });
  const openUntil = useRef<Partial<Record<GateColor, number>>>({});
  const startedAt = useRef<number | null>(null);
  const statusRef = useRef(status);
  const fallFlash = useRef(0);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const connected = useSmartCubeStore((s) => s.connected);
  const { tilt, level: levelIt, enablePhone, phone, nudge } = useTilt();

  const recordRef = useRef(record);
  useEffect(() => {
    statusRef.current = status;
    recordRef.current = record;
  });

  const { press } = usePlayInput((t) => {
    const face = t.physical[0] as GateColor;
    openUntil.current[face] = performance.now() + GATE_OPEN_MS;
  });

  // Arrow keys tilt when there's no sensor.
  useEffect(() => {
    const held = new Set<string>();
    const update = () => nudge((held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0), (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0));
    const down = (e: KeyboardEvent) => {
      if (!e.key.startsWith("Arrow")) return;
      e.preventDefault();
      held.add(e.key);
      update();
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.key);
      update();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [nudge]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const open = new Set<GateColor>();
      for (const [c, until] of Object.entries(openUntil.current)) if ((until ?? 0) > now) open.add(c as GateColor);
      const t = tilt.current;
      if (statusRef.current !== "won" && (t.x || t.y)) {
        if (statusRef.current === "ready") {
          statusRef.current = "rolling";
          setStatus("rolling");
          startedAt.current = now;
        }
        const res = stepBall(maze, solidRects(maze, open), ball.current, t, dt);
        ball.current = res.ball;
        if (res.event === "fell") {
          fallFlash.current = now;
          setFalls((f) => f + 1);
          navigator.vibrate?.(60);
        } else if (res.event === "won" && startedAt.current !== null) {
          const time = now - startedAt.current;
          statusRef.current = "won";
          setStatus("won");
          setElapsed(time);
          navigator.vibrate?.([40, 50, 40, 50, 120]);
          recordRef.current(time);
        }
      } else if (statusRef.current !== "won") {
        // No tilt: still let momentum carry it.
        const res = stepBall(maze, solidRects(maze, open), ball.current, { x: 0, y: 0 }, dt);
        ball.current = res.ball;
      }
      if (now - lastUi > 100) {
        lastUi = now;
        if (statusRef.current === "rolling" && startedAt.current !== null) setElapsed(now - startedAt.current);
        setTiltSource(t.source);
      }
      draw(canvas.current, maze, ball.current, openUntil.current, now, tilt.current, fallFlash.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [maze, tilt]);

  const gateColors = [...new Set(maze.gates.map((g) => g.color))];
  const aspect = maze.w / maze.h;

  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--play-dim)]">Level</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={level <= 1} onClick={() => setLevel((l) => l - 1)} className="h-7 w-7 rounded-full border border-white/10 text-sm disabled:opacity-30">
              ‹
            </button>
            <span className="w-7 text-center text-2xl font-black tabular-nums">{level}</span>
            <button type="button" disabled={level >= 12} onClick={() => setLevel((l) => l + 1)} className="h-7 w-7 rounded-full border border-white/10 text-sm disabled:opacity-30">
              ›
            </button>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-black tabular-nums">{fmt(elapsed)}</span>
          <span className="text-[11px] text-[var(--play-dim)]">
            {falls} fall{falls === 1 ? "" : "s"} · best {best[level] ? fmt(best[level]) : "—"}
          </span>
        </div>
      </div>

      <div className="relative mx-auto w-full" style={{ maxWidth: `min(100%, ${Math.round(62 * aspect)}vh)` }}>
        <canvas ref={canvas} width={maze.w * 64} height={maze.h * 64} className="block h-auto w-full rounded-2xl border border-white/10 bg-[#07141a]" />
        {status === "won" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/65 text-center backdrop-blur-[2px] animate-fade-in-up">
            <p className="text-3xl font-black">Out in {fmt(elapsed)}</p>
            <p className="text-sm text-[var(--play-dim)]">
              {falls === 0 ? "Clean — no falls." : `${falls} fall${falls === 1 ? "" : "s"} on the way.`} {best[level] === elapsed ? "New best!" : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={retry} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">
                Retry
              </button>
              {level < 12 && (
                <button type="button" onClick={() => setLevel((l) => l + 1)} className="play-btn play-glow px-5 py-2 text-sm">
                  Level {level + 1} →
                </button>
              )}
            </div>
          </div>
        )}
        {status === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-[var(--play-accent)] play-pulse">Tilt to start the clock</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {gateColors.map((c) => (
          <span key={c} className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FACE_HEX[c] }} />
            turn {FACE_COLOR_NAMES[c]}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(gyroActive || phone) && (
          <button type="button" onClick={levelIt} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold">
            <Crosshair size={13} /> Hold level &amp; tap to zero
          </button>
        )}
        {!gyroActive && !phone && (
          <button type="button" onClick={() => void enablePhone()} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold">
            <Smartphone size={13} /> Tilt this phone instead
          </button>
        )}
      </div>

      {!connected && <TurnPad onTurn={press} />}
      <p className="text-[11px] leading-snug text-[var(--play-dim)]">
        {tiltSource === "cube"
          ? "Steering with the cube's gyro. Hold it like a tray, top face up."
          : tiltSource === "phone"
            ? "Steering with this phone's tilt sensor."
            : gyroActive
              ? "Tilt the cube to roll."
              : connected
                ? "This cube has no gyro — tilt your phone, or use the arrow keys, and turn faces to open gates."
                : "Arrow keys tilt the board; turn faces (pad or csTimer keys) to open gates. Connect a gyro cube to steer for real."}
      </p>
    </>
  );
}

function draw(c: HTMLCanvasElement | null, m: Maze, ball: Ball, openUntil: Partial<Record<GateColor, number>>, now: number, tilt: { x: number; y: number }, fellAt: number) {
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const s = c.width / m.w;
  ctx.clearRect(0, 0, c.width, c.height);

  // Floor shading follows the tilt, so you can see which way is down.
  const g = ctx.createLinearGradient(c.width / 2 - tilt.x * c.width, c.height / 2 - tilt.y * c.height, c.width / 2 + tilt.x * c.width, c.height / 2 + tilt.y * c.height);
  g.addColorStop(0, "rgba(61,232,255,0.07)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  // Exit pad.
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  ctx.fillStyle = `rgba(61,255,168,${0.18 + pulse * 0.2})`;
  ctx.fillRect(m.exit.c * s + 6, m.exit.r * s + 6, s - 12, s - 12);
  ctx.strokeStyle = "#3dffa8";
  ctx.lineWidth = 2;
  ctx.strokeRect(m.exit.c * s + 6, m.exit.r * s + 6, s - 12, s - 12);

  for (const h of m.holes) {
    const rg = ctx.createRadialGradient(h.x * s, h.y * s, 0, h.x * s, h.y * s, HOLE_R * s * 1.25);
    rg.addColorStop(0, "#000");
    rg.addColorStop(0.75, "#000");
    rg.addColorStop(1, "rgba(255,59,74,0.35)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(h.x * s, h.y * s, HOLE_R * s * 1.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Walls.
  ctx.fillStyle = "#3de8ff";
  ctx.shadowColor = "#3de8ff";
  ctx.shadowBlur = 10;
  for (const r of solidRects(m, new Set(m.gates.map((gt) => gt.color)))) ctx.fillRect(r.x0 * s, r.y0 * s, (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
  ctx.shadowBlur = 0;

  // Gates: solid when shut, a draining dashed outline while open.
  for (const gt of m.gates) {
    const left = (openUntil[gt.color] ?? 0) - now;
    const open = left > 0;
    const hw = (WALL / 2) * s;
    const [x0, y0, x1, y1] =
      gt.side === "e" ? [(gt.c + 1) * s - hw, gt.r * s + hw, (gt.c + 1) * s + hw, (gt.r + 1) * s - hw] : [gt.c * s + hw, (gt.r + 1) * s - hw, (gt.c + 1) * s - hw, (gt.r + 1) * s + hw];
    ctx.fillStyle = FACE_HEX[gt.color];
    if (!open) {
      ctx.shadowColor = FACE_HEX[gt.color];
      ctx.shadowBlur = 16;
      ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
      ctx.shadowBlur = 0;
    } else {
      const frac = left / GATE_OPEN_MS;
      ctx.globalAlpha = 0.25 + 0.5 * frac;
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = FACE_HEX[gt.color];
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      // Countdown bar alongside.
      if (gt.side === "e") ctx.fillRect(x0 - 1, y0, 3, (y1 - y0) * frac);
      else ctx.fillRect(x0, y0 - 1, (x1 - x0) * frac, 3);
      ctx.globalAlpha = 1;
    }
  }

  // Marble.
  const bx = ball.x * s;
  const by = ball.y * s;
  const r = BALL_R * s;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(bx + 4, by + 6, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const bg = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.4, "#c9f7ff");
  bg.addColorStop(1, "#1d8fb0");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  const since = now - fellAt;
  if (fellAt && since < 500) {
    ctx.fillStyle = `rgba(255,59,74,${0.35 * (1 - since / 500)})`;
    ctx.fillRect(0, 0, c.width, c.height);
  }
}
