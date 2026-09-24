"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { FACE_HEX, PlayShell, TurnPad } from "@/components/play/PlayShell";
import { usePlayInput } from "@/lib/play/usePlayInput";
import { COLS, PIECES, ROWS, apply, cells, ghost, gravityMs, newGame, step, type Game, type PieceType, type TwistrisAction } from "@/lib/play/twistris";
import { orientationLabel } from "@/lib/gyro/orientation";
import { currentOrientation } from "@/lib/play/usePlayInput";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useStored } from "@/lib/play/useStored";

const ACCENT = "#ff4fd8";
const INK: Record<PieceType, string> = { I: "#38e1ff", O: FACE_HEX.D, T: ACCENT, S: FACE_HEX.F, Z: FACE_HEX.R, J: FACE_HEX.B, L: FACE_HEX.L };
const BEST_KEY = "twistris-best";

/** Grip face → action. Direction doesn't matter except on U, which rotates each way. */
function actionFor(grip: string): TwistrisAction | null {
  const prime = grip.includes("'");
  switch (grip[0]) {
    case "R":
      return "right";
    case "L":
      return "left";
    case "U":
      return prime ? "ccw" : "cw";
    case "D":
      return "soft";
    case "F":
      return "drop";
    case "B":
      return "hold";
    default:
      return null;
  }
}

const PAD_LABELS: Record<string, string> = { R: "→", "R'": "→", L: "←", "L'": "←", U: "⟳", "U'": "⟲", D: "↓", "D'": "↓", F: "⤓", "F'": "⤓", B: "hold", "B'": "hold" };

const ARROWS: Record<string, TwistrisAction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "cw", z: "ccw", ArrowDown: "soft", " ": "drop", c: "hold" };

/**
 * Twistris: falling blocks, and the cube is the controller. R slides right,
 * L slides left, U spins (U' the other way), D nudges down, F slams, B
 * holds — in your grip, so it follows the gyro if you regrip. Smart cubes
 * send a half turn as two quarters, so F2 would double-slam: slams and holds
 * ignore a repeat within a beat.
 */
export default function TwistrisPage() {
  const [game, setGame] = useState<Game>(() => newGame(1));
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useStored<number>(BEST_KEY, 0);
  const bestRef = useRef(best);
  const [tps, setTps] = useState(0);
  const gameRef = useRef(game);
  const runRef = useRef({ started: false, paused: false });
  const canvas = useRef<HTMLCanvasElement>(null);
  const flash = useRef<{ rows: number[]; at: number }>({ rows: [], at: 0 });
  const lastBurst = useRef<Record<string, number>>({});
  const turnTimes = useRef<number[]>([]);
  const connected = useSmartCubeStore((s) => s.connected);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const [grip, setGrip] = useState("");

  useEffect(() => {
    runRef.current = { started, paused };
    bestRef.current = best;
  }, [started, paused, best]);

  const commit = useCallback((g: Game) => {
    if (g.lastClear.length && g.lastClear !== gameRef.current.lastClear) flash.current = { rows: g.lastClear, at: performance.now() };
    gameRef.current = g;
    setGame(g);
    if (g.over && g.score > bestRef.current) setBest(g.score);
  }, [setBest]);

  const start = useCallback(() => {
    commit(newGame(Date.now()));
    setStarted(true);
    setPaused(false);
  }, [commit]);

  const act = useCallback(
    (action: TwistrisAction) => {
      const { started: s, paused: p } = runRef.current;
      if (!s || p || gameRef.current.over) return;
      if (action === "drop" || action === "hold") {
        const now = performance.now();
        if (now - (lastBurst.current[action] ?? 0) < 200) return;
        lastBurst.current[action] = now;
      }
      commit(apply(gameRef.current, action));
    },
    [commit],
  );

  const { press } = usePlayInput((t) => {
    const now = performance.now();
    turnTimes.current = [...turnTimes.current.filter((x) => now - x < 2000), now];
    if (!runRef.current.started || gameRef.current.over) {
      // Any turn starts a game: a U2 is a fine "insert coin".
      if (t.grip[0] === "U" && !runRef.current.started) start();
      else if (gameRef.current.over && t.grip[0] === "U") start();
      return;
    }
    const a = actionFor(t.grip);
    if (a) act(a);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ARROWS[e.key];
      if (e.key === "p" || e.key === "Escape") {
        setPaused((v) => !v);
        return;
      }
      if (e.key === "Enter" && (!runRef.current.started || gameRef.current.over)) {
        start();
        return;
      }
      if (!a) return;
      e.preventDefault();
      act(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, start]);

  // Gravity + drawing, one loop.
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      const { started: s, paused: p } = runRef.current;
      const g = gameRef.current;
      if (s && !p && !g.over) {
        acc += dt;
        const every = gravityMs(g.level);
        if (acc >= every) {
          acc = 0;
          commit(step(g));
        }
      }
      draw(canvas.current, gameRef.current, flash.current, now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [commit]);

  useEffect(() => {
    const onVis = () => document.hidden && setPaused(true);
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      const now = performance.now();
      turnTimes.current = turnTimes.current.filter((x) => now - x < 2000);
      setTps(turnTimes.current.length / 2);
      if (useSmartCubeStore.getState().gyroActive) setGrip(orientationLabel(currentOrientation()));
    }, 250);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, []);

  return (
    <PlayShell accent={ACCENT} title="Twistris" tagline="Falling blocks, and your cube is the controller. Turn R to slide right, L to slide left, U to spin, F to slam it down.">
      <div className="flex items-start justify-center gap-3">
        <div className="relative">
          <canvas ref={canvas} width={COLS * 24} height={ROWS * 24} className="block h-auto w-[216px] rounded-xl border border-white/10 bg-[#0d0612] sm:w-[240px]" />
          {(!started || game.over || paused) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/70 p-4 text-center backdrop-blur-[2px]">
              <p className="text-2xl font-black tracking-tight">{game.over && started ? "Topped out" : paused ? "Paused" : "Ready?"}</p>
              {game.over && started && <p className="text-sm text-[var(--play-dim)]">{game.score.toLocaleString()} points</p>}
              {paused && started && !game.over ? (
                <button type="button" onClick={() => setPaused(false)} className="play-btn flex items-center gap-1.5 px-5 py-2 text-sm">
                  <Play size={15} /> Resume
                </button>
              ) : (
                <button type="button" onClick={start} className="play-btn play-glow flex items-center gap-1.5 px-5 py-2 text-sm">
                  {game.over && started ? <RotateCcw size={15} /> : <Play size={15} />} {game.over && started ? "Again" : "Start"}
                </button>
              )}
              <p className="text-[11px] text-[var(--play-dim)]">{connected ? "…or turn U to start" : "…or press Enter"}</p>
            </div>
          )}
        </div>
        <div className="flex w-[104px] flex-col gap-2.5">
          <Mini label="Hold" type={game.hold} dim={!game.canHold} />
          <div className="play-panel flex flex-col gap-1 rounded-xl p-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--play-dim)]">Next</span>
            {game.queue.slice(0, 3).map((t, i) => (
              <PieceGlyph key={i} type={t} size={i === 0 ? 11 : 8} />
            ))}
          </div>
          <Stat label="Score" value={game.score.toLocaleString()} big />
          <Stat label="Lines" value={String(game.lines)} />
          <Stat label="Level" value={String(game.level)} />
          <Stat label="Best" value={best.toLocaleString()} />
          <Stat label="TPS" value={tps.toFixed(1)} />
          {started && !game.over && (
            <button type="button" onClick={() => setPaused((v) => !v)} className="flex items-center justify-center gap-1 rounded-full border border-white/10 py-1.5 text-[11px] text-[var(--play-dim)]">
              <Pause size={12} /> Pause
            </button>
          )}
        </div>
      </div>

      {!connected && <TurnPad onTurn={press} labels={PAD_LABELS} />}
      <div className="play-panel grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-2xl p-3 text-[11.5px]">
        {[
          ["R", "slide right"],
          ["L", "slide left"],
          ["U / U'", "spin ⟳ / ⟲"],
          ["D", "nudge down"],
          ["F", "slam"],
          ["B", "hold"],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="font-black" style={{ color: ACCENT }}>
              {k}
            </span>
            <span className="text-[var(--play-dim)]">{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-[var(--play-dim)]">
        {connected
          ? gyroActive
            ? `Controls follow your grip via the gyro${grip ? ` — now ${grip}` : ""}.`
            : "Controls assume the home grip: yellow top, green front."
          : "No cube? csTimer keys work (I/K right, D/E left, J/F spin, S/L down, H/G slam, W/O hold), and so do the arrows, Space and C."}
      </p>
    </PlayShell>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--play-dim)]">{label}</span>
      <span className={big ? "text-xl font-black tabular-nums" : "text-sm font-bold tabular-nums"}>{value}</span>
    </div>
  );
}

function PieceGlyph({ type, size }: { type: PieceType; size: number }) {
  const cs = cells({ type, rot: 0, x: 0, y: 0 });
  const w = Math.max(...cs.map(([x]) => x)) + 1;
  const minY = Math.min(...cs.map(([, y]) => y));
  return (
    <svg width={w * size} height={2 * size} className="my-0.5">
      {cs.map(([x, y]) => (
        <rect key={`${x}${y}`} x={x * size} y={(y - minY) * size} width={size - 1.5} height={size - 1.5} rx={2} fill={INK[type]} />
      ))}
    </svg>
  );
}

function Mini({ label, type, dim }: { label: string; type: PieceType | null; dim: boolean }) {
  return (
    <div className="play-panel flex min-h-[52px] flex-col gap-1 rounded-xl p-2" style={{ opacity: dim ? 0.45 : 1 }}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--play-dim)]">{label}</span>
      {type ? <PieceGlyph type={type} size={10} /> : <span className="text-[10px] text-white/20">turn B</span>}
    </div>
  );
}

function draw(c: HTMLCanvasElement | null, g: Game, flash: { rows: number[]; at: number }, now: number) {
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const s = c.width / COLS;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, c.height);
    ctx.stroke();
  }
  const block = (x: number, y: number, color: string, alpha = 1) => {
    if (y < 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3, 4);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x * s + 4, y * s + 4, s - 8, 3);
    ctx.globalAlpha = 1;
  };
  g.board.forEach((row, y) => row.forEach((v, x) => v && block(x, y, INK[PIECES[v - 1]])));
  if (!g.over) {
    for (const [x, y] of cells(ghost(g))) block(x, y, INK[g.active.type], 0.16);
    ctx.shadowColor = INK[g.active.type];
    ctx.shadowBlur = 14;
    for (const [x, y] of cells(g.active)) block(x, y, INK[g.active.type]);
    ctx.shadowBlur = 0;
  }
  const age = now - flash.at;
  if (flash.rows.length && age < 380) {
    // The cleared rows are gone from the board already; flash a sweep across the rows that landed there.
    ctx.globalAlpha = 1 - age / 380;
    ctx.fillStyle = "#fff";
    const n = flash.rows.length;
    const bottom = Math.max(...flash.rows);
    ctx.fillRect(0, (bottom - n + 1) * s, c.width, n * s);
    ctx.globalAlpha = 1;
  }
}
