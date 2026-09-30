import type { GuideView } from "./scrambleGuide";

/**
 * What to say while a smart cube is being scrambled, so you can keep your
 * eyes on the cube: each next turn as the previous one is made, what to undo
 * after a wrong turn, and "scrambled" at the end. Driven by the same
 * GuideView the on-screen guide draws, so the voice and the screen never
 * disagree.
 */

/** "R'" → "R prime", "U2" → "U 2" — a speech engine says "R'" as nothing at all. */
export function spokenTurn(token: string): string {
  const face = token[0];
  if (token.endsWith("2")) return `${face} 2`;
  if (token.endsWith("'")) return `${face} prime`;
  return face;
}

const same = (a: GuideView | null, b: GuideView): boolean =>
  !!a && a.done === b.done && a.index === b.index && a.partial === b.partial && a.fix === b.fix && a.undo.join(",") === b.undo.join(",");

/** The line to speak when the guide moves from `prev` to `next`, or null to stay quiet. */
export function scrambleCallout(prev: GuideView | null, next: GuideView): string | null {
  if (same(prev, next)) return null;
  if (next.done) return prev?.done ? null : "Scrambled";
  if (next.undo.length > 0) {
    const was = prev?.undo.length ?? 0;
    // A fresh mistake reads out the whole way back; unwinding it just names the next turn.
    return next.undo.length > was ? `Undo ${next.undo.map(spokenTurn).join(", ")}` : spokenTurn(next.undo[0]);
  }
  if (next.fix) return `Turn ${spokenTurn(next.fix)}`;
  if (next.partial) return "Again";
  const step = next.steps[next.index];
  if (!step) return null;
  const advanced = !prev || prev.index !== next.index || prev.undo.length > 0 || prev.fix !== null;
  return advanced ? spokenTurn(step) : null;
}
