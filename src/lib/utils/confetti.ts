"use client";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
  color: string;
  life: number;
}

const COLORS = ["#2dd4bf", "#38bdf8", "#fbbf24", "#f87171", "#34d399", "#eef0f3"];

/** A short, lightweight confetti burst from the top of the screen — no external library. */
export function fireConfetti(): void {
  if (typeof window === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "60";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const count = 70;
  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 120,
    y: canvas.height * 0.25,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -8 - 4,
    rotation: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    size: 5 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    life: 1,
  }));

  const gravity = 0.28;
  let raf: number;

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life -= 0.012;
      if (p.life > 0 && p.y < canvas.height + 20) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    if (alive) {
      raf = requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  raf = requestAnimationFrame(tick);
  setTimeout(() => {
    cancelAnimationFrame(raf);
    canvas.remove();
  }, 3500);
}
