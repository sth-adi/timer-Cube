/**
 * Hand-built illustrations for the Play games — each one drawn from cube
 * stickers, so the hub reads as its own place instead of a grid of stock
 * icons. Pure SVG, no state.
 */

import { PHASE_INK, fitTransform, portrait } from "@/lib/play/portrait";

const C = { w: "#f4f4f6", r: "#ff3b4a", g: "#22d67a", y: "#ffd400", o: "#ff8a1e", b: "#2f7bff", k: "#15121f" };

type Pt = [number, number];
const add = (p: Pt, a: Pt, u: number, b: Pt, v: number): Pt => [p[0] + a[0] * u + b[0] * v, p[1] + a[1] * u + b[1] * v];

/** One isometric face, 3×3 stickers, spanning P + u·a + v·b. */
function Face({ p, a, b, colors, gap = 0.09 }: { p: Pt; a: Pt; b: Pt; colors: readonly string[]; gap?: number }) {
  const quads = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const u0 = i / 3 + gap / 3;
      const u1 = (i + 1) / 3 - gap / 3;
      const v0 = j / 3 + gap / 3;
      const v1 = (j + 1) / 3 - gap / 3;
      const pts = [add(p, a, u0, b, v0), add(p, a, u1, b, v0), add(p, a, u1, b, v1), add(p, a, u0, b, v1)];
      quads.push(<polygon key={`${i}${j}`} points={pts.map((q) => q.join(",")).join(" ")} fill={colors[j * 3 + i]} />);
    }
  return <g>{quads}</g>;
}

function IsoCube({ x, y, s, top, left, right }: { x: number; y: number; s: number; top: readonly string[]; left: readonly string[]; right: readonly string[] }) {
  const k = Math.cos(Math.PI / 6);
  const e1: Pt = [k * s, -0.5 * s];
  const e2: Pt = [-k * s, -0.5 * s];
  const e3: Pt = [0, s];
  const P: Pt = [x, y];
  const outline = [add(P, e1, 1, e2, 0), add(P, e1, 1, e2, 1), add(P, e2, 1, e1, 0), add(P, e2, 1, e3, 1), add(P, e3, 1, e1, 0), add(P, e1, 1, e3, 1)];
  return (
    <g>
      <polygon points={outline.map((q) => q.join(",")).join(" ")} fill={C.k} />
      <Face p={P} a={e1} b={e2} colors={top} />
      <Face p={P} a={e2} b={e3} colors={left} />
      <Face p={P} a={e1} b={e3} colors={right} />
    </g>
  );
}

const fill = (c: string) => Array<string>(9).fill(c);

export function VaultArt({ className }: { className?: string }) {
  // A cube whose right face is a vault door: dial in the middle, bolts around it.
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <defs>
        <radialGradient id="vg" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffc53d" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffc53d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="112" cy="80" r="70" fill="url(#vg)" />
      <IsoCube x={100} y={75} s={52} top={[C.w, C.r, C.b, C.g, C.w, C.o, C.y, C.b, C.r]} left={[C.g, C.y, C.o, C.r, C.g, C.w, C.b, C.o, C.g]} right={fill("#2a2334")} />
      <g transform="translate(122.5,88) skewY(-30)">
        <circle r="17" fill="#15111c" stroke="#ffc53d" strokeWidth="2.5" />
        <circle r="10" fill="none" stroke="#ffc53d" strokeWidth="1.5" strokeDasharray="2 3" />
        <line x1="0" y1="0" x2="0" y2="-13" stroke="#ffc53d" strokeWidth="3" strokeLinecap="round" />
        <circle r="3" fill="#ffc53d" />
      </g>
      {[
        [107, 79],
        [138, 61],
        [107, 115],
        [139, 97],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#ffc53d" />
      ))}
      <text x="30" y="138" fontSize="10" fontFamily="monospace" fill="#ffc53d" opacity="0.7">
        R U F&apos; D2 B L&apos; …
      </text>
    </svg>
  );
}

export function MazeArt({ className }: { className?: string }) {
  // A tilted board seen in perspective, one gate open, one shut, marble mid-roll.
  const walls = [
    "M10 10 H90 V90 H10 Z",
    "M30 10 V50 H50",
    "M70 30 V70 H30",
    "M10 70 H20",
    "M50 30 H70",
    "M50 70 V90",
    "M90 50 H80",
  ];
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <g transform="translate(100 78) scale(1.25 0.72) rotate(45) translate(-50 -50)">
        <rect x="6" y="6" width="88" height="88" rx="4" fill="#0c1a22" stroke="#3de8ff" strokeOpacity="0.35" />
        {walls.map((d) => (
          <path key={d} d={d} fill="none" stroke="#3de8ff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <line x1="70" y1="70" x2="90" y2="70" stroke={C.r} strokeWidth="4.5" strokeLinecap="round" />
        <line x1="30" y1="50" x2="30" y2="70" stroke={C.g} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="3 4" opacity="0.6" />
        <circle cx="60" cy="40" r="5" fill="#05080b" stroke="#ff3b4a" strokeOpacity="0.4" />
        <rect x="80" y="80" width="10" height="10" fill="#3dffa8" opacity="0.5" />
      </g>
      <ellipse cx="86" cy="102" rx="10" ry="4" fill="#000" opacity="0.5" />
      <circle cx="86" cy="94" r="8.5" fill="url(#mz)" />
      <defs>
        <radialGradient id="mz" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor="#bdf6ff" />
          <stop offset="1" stopColor="#2aa6c4" />
        </radialGradient>
      </defs>
      <path d="M50 30 q-14 8 -8 22" fill="none" stroke="#3de8ff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M150 30 q14 8 8 22" fill="none" stroke="#3de8ff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function TwistrisArt({ className }: { className?: string }) {
  const s = 13;
  const block = (x: number, y: number, c: string, o = 1) => <rect key={`${x},${y}`} x={x * s} y={y * s} width={s - 2} height={s - 2} rx="2.5" fill={c} opacity={o} />;
  const stack: [number, number, string][] = [
    [0, 9, C.b], [1, 9, C.b], [2, 9, C.o], [3, 9, C.o], [4, 9, C.o], [6, 9, C.g], [7, 9, C.g], [8, 9, C.r], [9, 9, C.r],
    [0, 8, C.b], [1, 8, C.y], [2, 8, C.y], [3, 8, C.o], [6, 8, C.g], [7, 8, C.w], [8, 8, C.r], [9, 8, C.r],
    [0, 7, C.b], [1, 7, C.y], [2, 7, C.y], [7, 7, C.w], [8, 7, C.w], [9, 7, C.w],
  ];
  const falling: [number, number][] = [[4, 3], [5, 3], [5, 4], [5, 5]];
  return (
    <svg viewBox="-35 -10 200 150" className={className} aria-hidden>
      <rect x="-3" y="-3" width={10 * s + 4} height={10 * s + 4} rx="6" fill="#140a18" stroke="#ff4fd8" strokeOpacity="0.4" />
      {stack.map(([x, y, c]) => block(x, y, c))}
      {falling.map(([x, y]) => block(x, y, "#ff4fd8"))}
      {[[4, 9], [5, 9], [5, 8], [5, 7]].map(([x, y]) => block(x, y, "#ff4fd8", 0.18))}
      <path d={`M${4.5 * s} ${2.6 * s} q-${s * 1.2} -${s * 1.4} ${s * 0.4} -${s * 2.2}`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d={`M${4.9 * s} ${0.2 * s} l-${s * 0.5} ${s * 0.05} l${s * 0.25} ${s * 0.45}`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <text x={6.4 * s} y={2.4 * s} fontSize="12" fontWeight="800" fill="#ff4fd8" fontFamily="system-ui">
        U
      </text>
    </svg>
  );
}

const SAMPLE_MOVES = "U' R2 F R U R' U' F' L U L' D R U2 R' U' R U R' F R U R' U' F' R U R' U' R' F R2 U' R' U' R U R' F' U2".split(" ");
const SAMPLE_TIMES = SAMPLE_MOVES.map((_, i) => i * 140 + (i === 7 ? 900 : 0) + (i > 7 ? 900 : 0) + (i > 20 ? 1100 : 0) + (i > 30 ? 600 : 0));
const SAMPLE = portrait(SAMPLE_MOVES, SAMPLE_TIMES, [SAMPLE_TIMES[7], SAMPLE_TIMES[20], SAMPLE_TIMES[30]]);

export function PortraitArt({ className }: { className?: string }) {
  const { scale, ox, oy } = fitTransform(SAMPLE.bounds, 200, 150, 0.1);
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <defs>
        <filter id="pglow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#pglow)">
        {SAMPLE.segs.map((s, i) => (
          <line
            key={i}
            x1={s.x1 * scale + ox}
            y1={s.y1 * scale + oy}
            x2={s.x2 * scale + ox}
            y2={s.y2 * scale + oy}
            stroke={PHASE_INK[s.phase]}
            strokeWidth={s.w * 1.3}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}

export function WakeArt({ className }: { className?: string }) {
  // An alarm clock whose face is a scrambled cube face.
  const face = [C.r, C.w, C.b, C.y, C.o, C.g, C.w, C.r, C.y];
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <defs>
        <radialGradient id="wk" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#ff7a45" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="78" r="72" fill="url(#wk)" />
      <circle cx="68" cy="36" r="15" fill="#ff7a45" />
      <circle cx="132" cy="36" r="15" fill="#ff7a45" />
      <rect x="96" y="20" width="8" height="12" rx="2" fill="#ff7a45" />
      <line x1="72" y1="118" x2="62" y2="134" stroke="#ff7a45" strokeWidth="6" strokeLinecap="round" />
      <line x1="128" y1="118" x2="138" y2="134" stroke="#ff7a45" strokeWidth="6" strokeLinecap="round" />
      <circle cx="100" cy="82" r="46" fill="#1a0e0a" stroke="#ff7a45" strokeWidth="6" />
      {face.map((c, i) => (
        <rect key={i} x={76 + (i % 3) * 17} y={58 + Math.floor(i / 3) * 17} width="14" height="14" rx="3" fill={c} />
      ))}
      {[
        [36, 64, 24, 58],
        [30, 82, 16, 82],
        [164, 64, 176, 58],
        [170, 82, 184, 82],
      ].map(([x1, y1, x2, y2]) => (
        <line key={`${x1}${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffd1bd" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  );
}
