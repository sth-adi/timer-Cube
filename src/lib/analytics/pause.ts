/**
 * A gap between turns at least this long is a pause to look, not execution.
 * Kept in its own dependency-free module so light UI code can share the
 * exact threshold the history analytics use without pulling in the engine.
 */
export const PAUSE_MS = 400;
