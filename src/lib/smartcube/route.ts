import { mul, physicalFaceAt, tokenMatrix, type Mat3 } from "@/lib/gyro/orientation";

/**
 * Routes: a planned sequence of *physical* face turns (named by center
 * color, exactly as a smart cube reports them), plus the machinery to follow
 * a real cube along it turn by turn. Shared by the Sat-Nav (guided solving)
 * and the Time Machine (rewinding), which both say "do these turns" and then
 * watch whether you did.
 */

const SUFFIX: Record<number, string> = { 1: "", 2: "2", 3: "'" };

function amountOf(token: string): 1 | 2 | 3 {
  const s = token.slice(1);
  return s === "2" ? 2 : s === "'" ? 3 : 1;
}

function withAmount(face: string, amount: number): string {
  return face + SUFFIX[((amount % 4) + 4) % 4];
}

/**
 * Wide and slice turns in terms of what a smart cube actually sees: the
 * core (and every center) is the reference frame, so a wide r is reported
 * as the *opposite* face turning (L) while the whole cube re-orients by an
 * x; a slice M is R and L' with the cube re-orienting by x'.
 */
const WIDE: Record<string, { faces: [string, number][]; rotation: string }> = {
  r: { faces: [["L", 1]], rotation: "x" },
  l: { faces: [["R", 1]], rotation: "x'" },
  u: { faces: [["D", 1]], rotation: "y" },
  d: { faces: [["U", 1]], rotation: "y'" },
  f: { faces: [["B", 1]], rotation: "z" },
  b: { faces: [["F", 1]], rotation: "z'" },
  M: { faces: [["R", 1], ["L", 3]], rotation: "x'" },
  E: { faces: [["U", 1], ["D", 3]], rotation: "y'" },
  S: { faces: [["F", 3], ["B", 1]], rotation: "z" },
};

function rotationPower(rotation: string, amount: number): Mat3 {
  let m = tokenMatrix(rotation);
  for (let i = 1; i < amount; i++) m = mul(tokenMatrix(rotation), m);
  return m;
}

/**
 * Expands a book algorithm (any mix of face, wide, slice turns and cube
 * rotations, in the viewer's frame) into the physical face turns a smart
 * cube held in `grip` (body → viewer) would report, tracking how the grip
 * changes as the algorithm rotates the cube.
 */
export function toPhysicalTurns(alg: string, grip: Mat3): { turns: string[]; finalGrip: Mat3 } {
  let g = grip;
  const turns: string[] = [];
  for (const raw of alg.split(/\s+/).filter(Boolean)) {
    const base = raw[0];
    const amount = amountOf(raw.replace(/w/, ""));
    if ("xyz".includes(base)) {
      g = mul(rotationPower(base, amount), g);
      continue;
    }
    const wideBase = raw.includes("w") ? base.toLowerCase() : base;
    const wide = WIDE[wideBase];
    if (wide) {
      for (const [face, dir] of wide.faces) turns.push(withAmount(physicalFaceAt(g, face), dir * amount));
      g = mul(rotationPower(wide.rotation, amount), g);
      continue;
    }
    turns.push(withAmount(physicalFaceAt(g, base), amount));
  }
  return { turns: simplify(turns), finalGrip: g };
}

/** Merges adjacent turns of the same face (R R → R2, R R' → nothing). */
export function simplify(turns: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last[0] === t[0]) {
      const merged = (amountOf(last) + amountOf(t)) % 4;
      out.pop();
      if (merged !== 0) out.push(withAmount(t[0], merged));
    } else {
      out.push(t);
    }
  }
  return out;
}

export type RouteEvent = "progress" | "partial" | "done" | "off-route";

/**
 * Follows a cube along a route. A half turn can be done as two quarter
 * turns either way (R R or R' R'), which is how most smart cubes report it
 * anyway; anything else on a different face — or the wrong way on the
 * expected one — is off-route.
 */
export class RouteTracker {
  private index = 0;
  private acc = 0;

  constructor(private readonly route: readonly string[]) {}

  get position(): number {
    return this.index;
  }

  /** Quarter turns already made toward the current step (for half turns done as two quarters). */
  get partial(): boolean {
    return this.acc !== 0;
  }

  get finished(): boolean {
    return this.index >= this.route.length;
  }

  push(token: string): RouteEvent {
    if (this.finished) return "off-route";
    const expected = this.route[this.index];
    if (token[0] !== expected[0]) return "off-route";
    const target = amountOf(expected);
    this.acc = (this.acc + amountOf(token)) % 4;
    if (this.acc === target) {
      this.acc = 0;
      this.index++;
      return this.finished ? "done" : "progress";
    }
    if (this.acc === 0) return "partial"; // turned it and turned it back
    if (target === 2) return "partial"; // one quarter of a half turn
    return "off-route";
  }
}
