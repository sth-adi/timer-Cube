"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { subscribeFx, type FxImpactKind } from "@/lib/fx/fxBus";

/**
 * The app-wide spectacle layer: a particle canvas for sparks, shockwave
 * rings and shards; a cursor spotlight; per-card glow + tilt that follows the
 * pointer; click sparks; and the data attributes (`data-fx-level`,
 * `data-fx-phase`) the stylesheet keys off. Everything is written straight to
 * the DOM / canvas — none of it goes through React state — and the canvas
 * loop only runs while particles are alive. Flattens under
 * prefers-reduced-motion, and scales with the `fxLevel` setting.
 */

interface Spark {
  kind: "spark";
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  decay: number;
  size: number;
  color: string;
}
interface Ring {
  kind: "ring";
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  decay: number;
  color: string;
  delay: number;
}
interface Shard {
  kind: "shard";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  life: number;
  color: string;
}
type Particle = Spark | Ring | Shard;

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const MAX_PARTICLES = 700;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function palette(): string[] {
  return [cssVar("--accent", "#7c5cff"), cssVar("--cyan", "#35e6c5"), cssVar("--warning", "#ffb020"), cssVar("--success", "#3ddc84"), "#ffffff"];
}

export function FxLayer() {
  const fxLevel = useSettingsStore((s) => s.fxLevel);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(fxLevel);

  useEffect(() => {
    levelRef.current = fxLevel;
    document.documentElement.dataset.fxLevel = fxLevel;
    return () => {
      delete document.documentElement.dataset.fxLevel;
    };
  }, [fxLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const spot = spotRef.current;
    const flash = flashRef.current;
    if (!canvas || !spot || !flash) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const live = () => levelRef.current === "insane" && !reduced.matches;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- particle engine -------------------------------------------------
    const particles: Particle[] = [];
    let raf = 0;

    const frame = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.kind === "ring") {
          if (p.delay > 0) {
            p.delay -= 1;
            continue;
          }
          p.r += p.vr;
          p.vr *= 0.962;
          p.life -= p.decay;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, p.life) * 0.85;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1 + p.life * 5;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === "spark") {
          p.vy += p.g;
          p.vx *= 0.985;
          p.x += p.vx;
          p.y += p.vy;
          p.life -= p.decay;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.strokeStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.lineWidth = p.size * (0.4 + p.life * 0.6);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
          ctx.stroke();
        } else {
          p.vy += 0.22;
          p.vx *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          p.life -= 0.009;
          if (p.life <= 0 || p.y > h + 30) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalCompositeOperation = "source-over";
          ctx.shadowBlur = 0;
          ctx.globalAlpha = Math.min(1, p.life * 1.6);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (particles.length > 0 && !document.hidden) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, w, h);
      }
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const push = (p: Particle) => {
      if (particles.length < MAX_PARTICLES) particles.push(p);
    };

    const sparks = (x: number, y: number, count: number, power: number, colors: string[], gravity = 0.16) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.35 + Math.random() * 0.65) * power;
        push({
          kind: "spark",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - power * 0.15,
          g: gravity,
          life: 1,
          decay: 0.014 + Math.random() * 0.02,
          size: 1.6 + Math.random() * 2.4,
          color: colors[(Math.random() * colors.length) | 0],
        });
      }
    };
    const ring = (x: number, y: number, color: string, speed: number, delay = 0) =>
      push({ kind: "ring", x, y, r: 6, vr: speed, life: 1, decay: 0.017, color, delay });
    const shards = (x: number, y: number, count: number, colors: string[]) => {
      for (let i = 0; i < count; i++) {
        push({
          kind: "shard",
          x: x + (Math.random() - 0.5) * 160,
          y,
          vx: (Math.random() - 0.5) * 11,
          vy: -4 - Math.random() * 9,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 0.4,
          w: 5 + Math.random() * 6,
          h: 3 + Math.random() * 4,
          life: 1,
          color: colors[(Math.random() * colors.length) | 0],
        });
      }
    };

    const stageCenter = (): { x: number; y: number } => {
      const el = document.querySelector(".timer-stage");
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return { x: w / 2, y: h * 0.42 };
    };

    let shakeTimer = 0;
    const shake = (amp: number, ms: number) => {
      const stages = document.querySelectorAll<HTMLElement>(".timer-stage");
      if (!stages.length) return;
      stages.forEach((s) => {
        s.style.setProperty("--fx-shake", `${amp}px`);
        s.style.setProperty("--fx-shake-ms", `${ms}ms`);
        s.classList.remove("fx-shaking");
        void s.offsetWidth;
        s.classList.add("fx-shaking");
      });
      window.clearTimeout(shakeTimer);
      shakeTimer = window.setTimeout(() => stages.forEach((s) => s.classList.remove("fx-shaking")), ms + 40);
    };

    const flashScreen = (kind: FxImpactKind) => {
      flash.dataset.kind = kind;
      flash.classList.remove("on");
      void flash.offsetWidth;
      flash.classList.add("on");
    };

    const impact = (kind: FxImpactKind) => {
      if (!live()) {
        // Reduced motion / lower levels still get the quiet colour flash.
        if (levelRef.current !== "off" && !reduced.matches) flashScreen(kind);
        return;
      }
      const { x, y } = stageCenter();
      const pal = palette();
      if (kind === "solve") {
        ring(x, y, pal[0], 11);
        sparks(x, y, 22, 7.5, [pal[0], pal[1], "#ffffff"]);
        shake(3, 280);
        flashScreen("solve");
      } else if (kind === "pb") {
        ring(x, y, pal[0], 15);
        ring(x, y, pal[2], 12, 7);
        ring(x, y, pal[1], 9.5, 14);
        ring(x, y, "#ffffff", 7.5, 22);
        sparks(x, y, 110, 13, pal, 0.2);
        shards(x, y, 70, pal);
        shake(9, 520);
        flashScreen("pb");
      } else {
        ring(x, y, cssVar("--danger", "#ff4d6d"), 10);
        sparks(x, y, 34, 6, [cssVar("--danger", "#ff4d6d"), "#ff9a5c"], 0.3);
        shake(6, 380);
        flashScreen("dnf");
      }
      wake();
    };

    // ---- pointer: spotlight, card glow + tilt, click sparks -------------
    let px = -999;
    let py = -999;
    let pointerRaf = 0;
    let hotCard: HTMLElement | null = null;
    let lastTarget: EventTarget | null = null;

    const clearCard = () => {
      if (!hotCard) return;
      hotCard.style.removeProperty("--mx");
      hotCard.style.removeProperty("--my");
      hotCard.style.removeProperty("--fx-rx");
      hotCard.style.removeProperty("--fx-ry");
      hotCard = null;
    };

    const pointerFrame = () => {
      pointerRaf = 0;
      spot.style.transform = `translate3d(${px - 280}px, ${py - 280}px, 0)`;
      spot.style.opacity = "1";
      const nx = (px / w) * 2 - 1;
      const ny = (py / h) * 2 - 1;
      document.querySelectorAll<HTMLElement>(".fx-parallax").forEach((el) => {
        el.style.setProperty("--fx-px", nx.toFixed(3));
        el.style.setProperty("--fx-py", ny.toFixed(3));
      });
      const card = lastTarget instanceof Element ? (lastTarget.closest(".card") as HTMLElement | null) : null;
      if (card !== hotCard) clearCard();
      if (card) {
        hotCard = card;
        const r = card.getBoundingClientRect();
        const cx = px - r.left;
        const cy = py - r.top;
        card.style.setProperty("--mx", `${cx}px`);
        card.style.setProperty("--my", `${cy}px`);
        if (r.width < 520 && r.height < 360) {
          card.style.setProperty("--fx-rx", `${((cx / r.width - 0.5) * 5).toFixed(2)}deg`);
          card.style.setProperty("--fx-ry", `${(-(cy / r.height - 0.5) * 5).toFixed(2)}deg`);
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!live() || !finePointer.matches || e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      lastTarget = e.target;
      if (!pointerRaf) pointerRaf = requestAnimationFrame(pointerFrame);
    };
    const onLeave = () => {
      spot.style.opacity = "0";
      clearCard();
    };

    const onDown = (e: PointerEvent) => {
      if (!live()) return;
      if (document.documentElement.dataset.fxPhase === "running") return;
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('button, a[href], [role="button"], summary, [role="tab"]')) return;
      const pal = palette();
      ring(e.clientX, e.clientY, pal[0], 3.2);
      sparks(e.clientX, e.clientY, e.pointerType === "touch" ? 9 : 14, 4.2, [pal[0], pal[1], "#ffffff"], 0.1);
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    // ---- konami → party mode -------------------------------------------
    let konamiAt = 0;
    let partyTimer = 0;
    const party = () => {
      const root = document.documentElement;
      root.classList.add("fx-party");
      window.clearTimeout(partyTimer);
      partyTimer = window.setTimeout(() => root.classList.remove("fx-party"), 14000);
      if (!reduced.matches && levelRef.current !== "off") {
        const pal = palette();
        for (let i = 0; i < 7; i++) {
          window.setTimeout(() => {
            const x = w * (0.1 + Math.random() * 0.8);
            const y = h * (0.15 + Math.random() * 0.5);
            ring(x, y, pal[i % pal.length], 9);
            sparks(x, y, 50, 10, pal, 0.14);
            shards(x, y, 18, pal);
            wake();
          }, i * 240);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[konamiAt]) {
        konamiAt += 1;
        if (konamiAt === KONAMI.length) {
          konamiAt = 0;
          party();
        }
      } else {
        konamiAt = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);

    // ---- bus -------------------------------------------------------------
    const unsubscribe = subscribeFx((e) => {
      if (e.type === "phase") {
        document.documentElement.dataset.fxPhase = e.phase;
      } else if (e.type === "impact") {
        impact(e.kind);
      } else if (e.type === "burst") {
        if (!live()) return;
        const pal = palette();
        sparks(e.x, e.y, e.count ?? 16, e.power ?? 6, pal);
        wake();
      } else if (e.type === "party") {
        party();
      }
    });

    const onVisibility = () => {
      if (!document.hidden && particles.length) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(shakeTimer);
      window.clearTimeout(partyTimer);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pointerRaf);
      clearCard();
      document.documentElement.classList.remove("fx-party");
      delete document.documentElement.dataset.fxPhase;
    };
  }, []);

  return (
    <div aria-hidden="true">
      <div ref={spotRef} className="fx-spotlight" />
      <div ref={flashRef} className="fx-flash" />
      <canvas ref={canvasRef} className="fx-canvas" />
    </div>
  );
}
