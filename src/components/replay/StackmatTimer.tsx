import { useId } from "react";
import { SEVEN_SEGMENTS, lcdReading } from "@/lib/analysis/replayStage";

/** Half the digit's width and height, and the segment thickness, in the SVG's own units. */
const HW = 5.5;
const HH = 10;
const T = 2.4;

/** One horizontal or vertical segment as a hexagon with pointed ends, centred on (cx, cy). */
function segment(cx: number, cy: number, len: number, horizontal: boolean): string {
  const h = len / 2;
  const t = T / 2;
  const pts = horizontal
    ? [[-h, 0], [-h + t, -t], [h - t, -t], [h, 0], [h - t, t], [-h + t, t]]
    : [[0, -h], [t, -h + t], [t, h - t], [0, h], [-t, h - t], [-t, -h + t]];
  return pts.map(([x, y]) => `${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`).join(" ");
}

const SEGMENT_SHAPES: Record<string, string> = {
  a: segment(0, -HH, HW * 2 - 0.6, true),
  g: segment(0, 0, HW * 2 - 0.6, true),
  d: segment(0, HH, HW * 2 - 0.6, true),
  f: segment(-HW, -HH / 2, HH - 0.6, false),
  b: segment(HW, -HH / 2, HH - 0.6, false),
  e: segment(-HW, HH / 2, HH - 0.6, false),
  c: segment(HW, HH / 2, HH - 0.6, false),
};

/** Where the five digits sit across the LCD (offsets from its middle), and where the lit decimal point goes. */
const CELL_X = [-44, -22, 0, 22, 44];
const DOT_X = 11;
const COLON_X = -33;
/** The LCD's reading line curves like the glass does: y at the middle, how far the ends drop, and the half width they drop over. */
const LINE_Y = 90;
const LINE_DROP = 16;
const LINE_SPAN = 70;

function lineAt(dx: number): { y: number; angle: number } {
  const y = LINE_Y + LINE_DROP * (dx / LINE_SPAN) ** 2;
  const slope = (2 * LINE_DROP * dx) / LINE_SPAN ** 2;
  return { y, angle: (Math.atan(slope) * 180) / Math.PI };
}

function Digit({ value }: { value: number | null }) {
  const lit = value === null ? "" : SEVEN_SEGMENTS[value];
  return (
    <>
      {Object.entries(SEGMENT_SHAPES).map(([key, points]) => (
        <polygon key={key} points={points} className={lit.includes(key) ? "stackmat__seg stackmat__seg--on" : "stackmat__seg"} />
      ))}
    </>
  );
}

/**
 * A stackmat timer, drawn in SVG: the dark curved body, the grey-green LCD with seven-segment digits, the
 * red and green LEDs, the round buttons and the two hand pads at the sides. It shows `ms` the way the real
 * one does (hundredths, truncated); `running` lights the green LED and a stopped one lights the red.
 * Colours come from replaystage.css, so the body stays a body in every theme.
 */
export function StackmatTimer({ ms, running, className }: { ms: number; running: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { cells, colon } = lcdReading(ms);
  return (
    <svg viewBox="0 0 400 150" role="img" aria-label={`Stackmat timer, ${(ms / 1000).toFixed(2)} seconds`} className={className} focusable="false">
      <defs>
        <pattern id={`${uid}mos`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" className="stackmat__tile-gap" />
          <rect x="0.7" y="0.7" width="8.6" height="8.6" rx="1.3" className="stackmat__tile" />
        </pattern>
        <linearGradient id={`${uid}metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="stackmat__metal-hi" />
          <stop offset="0.55" className="stackmat__metal-mid" />
          <stop offset="1" className="stackmat__metal-lo" />
        </linearGradient>
        <g id={`${uid}hand`}>
          <circle r="14" className="stackmat__hand-disc" />
          <g className="stackmat__hand" transform="translate(-7 -9)">
            <rect x="1" y="3" width="3" height="9" rx="1.5" />
            <rect x="5" y="0" width="3" height="11" rx="1.5" />
            <rect x="9" y="1" width="3" height="10" rx="1.5" />
            <rect x="13" y="4" width="3" height="8" rx="1.5" />
            <rect x="1" y="8" width="15" height="9" rx="4" />
            <rect x="-2" y="9" width="3.2" height="7" rx="1.6" transform="rotate(-35 0 12)" />
          </g>
        </g>
      </defs>

      <ellipse cx="200" cy="137" rx="196" ry="9" className="stackmat__shadow" />
      <path d="M -8 92 Q 200 38 408 92 L 408 132 Q 200 78 -8 132 Z" className="stackmat__body" />

      <g transform="rotate(-9 40 112)">
        <rect x="-30" y="94" width="100" height="36" rx="12" className="stackmat__pad-rim" />
        <rect x="-26" y="98" width="92" height="28" rx="9" fill={`url(#${uid}mos)`} />
        <use href={`#${uid}hand`} x="20" y="112" />
      </g>
      <g transform="rotate(9 360 112)">
        <rect x="330" y="94" width="100" height="36" rx="12" className="stackmat__pad-rim" />
        <rect x="334" y="98" width="92" height="28" rx="9" fill={`url(#${uid}mos)`} />
        <use href={`#${uid}hand`} x="380" y="112" />
      </g>

      <path d="M 52 124 Q 200 6 348 124 Q 348 140 330 140 Q 200 90 70 140 Q 52 140 52 124 Z" fill={`url(#${uid}metal)`} className="stackmat__plate" />
      <path d="M 126 96 Q 200 56 274 96 L 270 116 Q 200 92 130 116 Z" className="stackmat__lcd" />

      {cells.map((value, i) => {
        const { y, angle } = lineAt(CELL_X[i]);
        return (
          <g key={i} transform={`translate(${200 + CELL_X[i]} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})`}>
            <Digit value={value} />
          </g>
        );
      })}
      {(() => {
        const { y, angle } = lineAt(DOT_X);
        return <circle cx={200 + DOT_X} cy={y + HH + 0.4} r="1.5" className="stackmat__seg stackmat__seg--on" transform={`rotate(${angle.toFixed(2)} ${200 + DOT_X} ${y})`} />;
      })()}
      {colon &&
        [-4, 4].map((dy) => {
          const { y } = lineAt(COLON_X);
          return <circle key={dy} cx={200 + COLON_X} cy={y + dy} r="1.4" className="stackmat__seg stackmat__seg--on" />;
        })}

      <circle cx="112" cy="86" r="4" className={running ? "stackmat__led stackmat__led--green" : "stackmat__led stackmat__led--off"} />
      <circle cx="114" cy="101" r="4" className={running ? "stackmat__led stackmat__led--off" : "stackmat__led stackmat__led--red"} />
      <g transform="translate(90 118)">
        <circle r="10" className="stackmat__button" />
        <circle r="6.5" className="stackmat__ring stackmat__ring--red" />
        <path d="M0 -4 v4" className="stackmat__ring stackmat__ring--red" strokeLinecap="round" />
      </g>
      <circle cx="286" cy="90" r="6" className="stackmat__button" />
      <path d="M284 87 l5 3 -5 3z" className="stackmat__icon" />
      <circle cx="292" cy="106" r="6" className="stackmat__button" />
      <g transform="translate(312 118)">
        <circle r="10.5" className="stackmat__button" />
        <circle r="7" className="stackmat__ring stackmat__ring--gold" strokeDasharray="36 8" transform="rotate(-60)" />
      </g>
    </svg>
  );
}
