export interface WindowStep {
  /** Position in the scramble (0-based). */
  index: number;
  token: string;
}

export interface ScrambleWindow {
  total: number;
  /** Turns completed, clamped to 0..total. A half-done double turn doesn't count yet. */
  done: number;
  /** done / total, 0..1. An empty scramble reads as complete. */
  progress: number;
  /** "7 / 22" */
  label: string;
  /** "7 of 22 turns done" */
  valueText: string;
  /** The turn to make now, or null when there's nothing left (empty or finished). */
  now: WindowStep | null;
  /** Up to `previewCount` turns after the current one. */
  next: WindowStep[];
  complete: boolean;
}

/** Which turn is "now", which come next and how far along the scramble is — everything the collapsed guide shows. */
export function scrambleWindow(steps: readonly string[], index: number, previewCount = 2): ScrambleWindow {
  const total = steps.length;
  const done = Number.isFinite(index) ? Math.min(Math.max(Math.trunc(index), 0), total) : 0;
  const complete = done >= total;
  const at = (i: number): WindowStep => ({ index: i, token: steps[i] });
  const count = Math.max(0, Math.trunc(previewCount));
  const next: WindowStep[] = [];
  for (let i = done + 1; i < total && next.length < count; i++) next.push(at(i));
  return {
    total,
    done,
    progress: total === 0 ? 1 : done / total,
    label: `${done} / ${total}`,
    valueText: `${done} of ${total} turns done`,
    now: complete ? null : at(done),
    next,
    complete,
  };
}
