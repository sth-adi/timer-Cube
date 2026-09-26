import { CUBE_ORIENTATIONS, FACE_COLOR_NAMES, nameRotation, physicalFaceAt, viewerMove, type Mat3 } from "@/lib/gyro/orientation";
import { mergeTurns } from "@/lib/xray/algMicroscope";
import type { CrossFace } from "@/lib/smartcube/crossFrame";
import type { SolveBreakdown } from "./solveBreakdown";

/**
 * The solve written out the way cubers share a reconstruction: in your own
 * grip (cross on the bottom), starting with the rotation from the
 * scramble's standard orientation, one line per step — cross, each pair,
 * OLL, PLL — labelled with its case, time and turn count. Paste it
 * anywhere, or open it in Twizzle.
 */

export interface ReconStep {
  label: string;
  caseName: string | null;
  /** The step's turns in your grip, quarter turns merged. */
  moves: string[];
  ms: number;
}

export interface Reconstruction {
  /** From standard orientation (white top, green front) to your grip. */
  rotation: string;
  grip: Mat3;
  gripLabel: string;
  steps: ReconStep[];
  text: string;
  twizzleUrl: string;
}

/** Fronts to prefer when holding a cross on the bottom: green first, as most cubers do. */
const FRONT_ORDER = ["F", "R", "B", "L", "U", "D"];

/** The grip with `crossFace` on the bottom and the most usual front. */
export function crossBottomGrip(crossFace: CrossFace): Mat3 {
  const options = CUBE_ORIENTATIONS.filter((g) => physicalFaceAt(g, "D") === crossFace);
  return [...options].sort((a, b) => FRONT_ORDER.indexOf(physicalFaceAt(a, "F")) - FRONT_ORDER.indexOf(physicalFaceAt(b, "F")))[0];
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

export function reconstruction(b: SolveBreakdown, scramble: string, opts: { totalMs: number; title?: string }): Reconstruction {
  const grip = crossBottomGrip(b.crossFace);
  const rotation = nameRotation(grip);
  const gripLabel = `${FACE_COLOR_NAMES[physicalFaceAt(grip, "U")]} top, ${FACE_COLOR_NAMES[physicalFaceAt(grip, "F")]} front`;

  // Each move belongs to the step whose end it falls on or before.
  const steps: ReconStep[] = [];
  let i = 0;
  for (const row of b.rows) {
    if (row.atMs === null) continue;
    const start = i;
    while (i < b.moves.length && b.moves[i].timeStampMs <= row.atMs) i++;
    const physical = b.moves.slice(start, i).map((m) => m.token);
    steps.push({
      label: row.label,
      caseName: row.caseName,
      moves: mergeTurns(physical.map((t) => viewerMove(t, grip))).tokens,
      ms: row.totalMs ?? 0,
    });
  }
  // Anything after the last step (shouldn't happen on a finished solve) stays with it.
  if (i < b.moves.length && steps.length) steps[steps.length - 1].moves.push(...b.moves.slice(i).map((m) => viewerMove(m.token, grip)));

  const turns = steps.reduce((n, s) => n + s.moves.length, 0);
  const lines = [
    `${rotation || ""} // inspection — ${gripLabel}`.trim(),
    ...steps.map((s, k) => {
      const what = s.caseName ? `${s.label}: ${s.caseName}` : s.label;
      // Two pairs in on one turn: the second has no turns of its own.
      if (!s.moves.length && k > 0) return `// ${what} — came in with ${steps[k - 1].label}`;
      return `${s.moves.join(" ") || "—"} // ${what} (${secs(s.ms)}s, ${s.moves.length} turn${s.moves.length === 1 ? "" : "s"})`;
    }),
    `// ${secs(opts.totalMs)}s · ${turns} turns · ${(turns / Math.max(0.001, opts.totalMs / 1000)).toFixed(2)} TPS`,
  ];
  const text = lines.join("\n");
  const params = new URLSearchParams({ "setup-alg": scramble, alg: text, title: opts.title ?? "Smart-cube solve" });
  return { rotation, grip, gripLabel, steps, text, twizzleUrl: `https://alpha.twizzle.net/edit/?${params.toString()}` };
}
