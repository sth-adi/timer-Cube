/**
 * Follows a smart cube through a scramble, turn by turn.
 *
 * The guide keeps two things: how many scramble steps are done, and the
 * *extra* turns made since then that aren't the next step. Every turn the
 * cube reports is merged into that extra stack (same-face turns combine,
 * turns on the opposite face commute past each other), so:
 *
 *   - extra is empty                         → on track, highlight step `index`
 *   - extra is exactly the next step         → step done, move on
 *   - extra is a quarter of a half-turn step → on track, half done
 *   - extra is one turn of the right face,
 *     the wrong amount (R' for R)            → one turn fixes it (R2)
 *   - anything else                          → off track: undo exactly
 *                                              those turns, newest first
 *
 * Undoing is itself just more turns merged into the stack, so the undo list
 * shrinks live as you unwind it, and any equivalent way back (R2 instead
 * of R R) is accepted. Pure: no cube state, no clock — see
 * scrambleGuide.test.ts.
 */

const OPPOSITE: Record<string, string> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };
const SUFFIX = ["", "", "2", "'"] as const;

export const amountOf = (token: string): 1 | 2 | 3 => (token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1);
const withAmount = (face: string, amount: number) => face + SUFFIX[((amount % 4) + 4) % 4];
export const invertTurn = (token: string) => withAmount(token[0], 4 - amountOf(token));

/** Appends a turn to a sequence, merging it into an earlier turn of the same face it commutes back to. */
export function mergeTurn(seq: readonly string[], token: string): string[] {
  const out = [...seq];
  const face = token[0];
  for (let i = out.length - 1; i >= 0; i--) {
    const f = out[i][0];
    if (f === face) {
      const amount = (amountOf(out[i]) + amountOf(token)) % 4;
      if (amount === 0) out.splice(i, 1);
      else out[i] = withAmount(face, amount);
      return out;
    }
    if (f !== OPPOSITE[face]) break; // a turn on another axis doesn't commute: stop looking back
  }
  out.push(token);
  return out;
}

export interface GuideView {
  steps: readonly string[];
  /** Steps completed. */
  index: number;
  /** The current step is a half turn and one quarter of it is done. */
  partial: boolean;
  /** Off track: the turns that undo the mistake, in order. Empty when on track. */
  undo: string[];
  /** Off track by just the wrong amount on the right face: the single turn that completes the step instead. */
  fix: string | null;
  done: boolean;
}

export class ScrambleGuide {
  private index = 0;
  private extra: string[] = [];

  constructor(readonly steps: readonly string[]) {}

  /** How far off the scramble the cube has wandered, in turns. */
  get offBy(): number {
    return this.extra.length;
  }

  /** Every turn the cube has been given since the guide started, simplified — for checking against the live cube. */
  get applied(): string[] {
    return [...this.steps.slice(0, this.index), ...this.extra];
  }

  push(token: string): GuideView {
    this.extra = mergeTurn(this.extra, token);
    // The next step counts as done if it's in the extra turns with only
    // opposite-face turns ahead of it (those commute, so L R is R L): take
    // it out and keep what's left as the mistake still to undo.
    for (;;) {
      const step = this.steps[this.index];
      if (!step) break;
      const want = withAmount(step[0], amountOf(step));
      const at = this.extra.findIndex((t) => t[0] !== OPPOSITE[step[0]]);
      if (at < 0 || this.extra[at] !== want) break;
      this.extra.splice(at, 1);
      this.index++;
    }
    return this.view();
  }

  /**
   * The cube turned without telling us (a dropped Bluetooth move): replace
   * the guide's idea of how far off it is with what was measured — the turns
   * that take the real cube back to the last completed step. They show up
   * as the undo list, and the scramble carries on from the same step.
   */
  resync(backToStep: readonly string[]): GuideView {
    this.extra = [...backToStep].reverse().map(invertTurn);
    return this.view();
  }

  view(): GuideView {
    const step = this.steps[this.index];
    const base = { steps: this.steps, index: this.index, partial: false, undo: [] as string[], fix: null as string | null, done: false };
    if (this.extra.length === 0) return { ...base, done: this.index >= this.steps.length };
    // A first extra turn on the current step's face is progress on that
    // step (or a near miss of it), not part of the mistake to undo.
    const head = step && this.extra[0][0] === step[0] ? this.extra[0] : null;
    const undo = this.extra.slice(head ? 1 : 0).reverse().map(invertTurn);
    if (!head) return { ...base, undo };
    // A half turn done as two quarters, either way round, is on track after the first.
    if (amountOf(step) === 2) return { ...base, undo, partial: true };
    // Right face, wrong amount (R' or R2 for R): one more turn of it completes the step.
    return { ...base, undo, fix: withAmount(step[0], amountOf(step) - amountOf(head)) };
  }
}
