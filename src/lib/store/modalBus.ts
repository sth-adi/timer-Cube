/**
 * "A modal or sheet is open" — an imperative flag, same deliberately-not-Zustand
 * pattern as fxBus.ts: the timer's key handlers read it at event time, so
 * nothing needs to re-render when it flips. A modal registers itself while it
 * is open (see hooks/useModalLayer.ts, which also does Esc, focus and Tab
 * trapping) and the timer ignores Space/Esc/Delete until it closes.
 *
 * It's a stack, so two layers open at once (a confirm over a sheet) keep the
 * flag set until both are gone, and only the topmost one answers Esc.
 */

type Listener = () => void;

const stack: symbol[] = [];
const listeners = new Set<Listener>();

/** Marks a modal as open. Returns its token and the function that closes it (idempotent). */
export function openModalLayer(): { token: symbol; close: () => void } {
  const token = Symbol("modal");
  stack.push(token);
  for (const l of listeners) l();
  return {
    token,
    close: () => {
      const i = stack.indexOf(token);
      if (i === -1) return;
      stack.splice(i, 1);
    },
  };
}

/** True while any modal or sheet is open — timer keyboard input and the global shortcuts stand down. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}

/** Whether `token` is the most recently opened layer still open. */
export function isTopModalLayer(token: symbol): boolean {
  return stack[stack.length - 1] === token;
}

/** Called each time a modal opens, e.g. so a hold in progress can be abandoned. */
export function onModalOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetModalLayersForTests(): void {
  stack.length = 0;
  listeners.clear();
}
