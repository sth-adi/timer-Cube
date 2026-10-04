/**
 * Several protocols (GAN, QiYi, MoYu32 among them) can fall behind and
 * deliver two or more real turns in a single Bluetooth notification — the
 * host only timestamps the *notification*, so every move inside it arrives
 * with the exact same `timestamp`, as if they'd all happened in the same
 * instant. `cubeTimestamp`, when the protocol provides one, is different: a
 * running counter of real elapsed hardware milliseconds that keeps
 * advancing turn to turn regardless of notification boundaries.
 *
 * Whenever a move's host timestamp repeats the previous one, this spreads
 * them back out using that counter's real deltas instead of recording them
 * as simultaneous — which would otherwise corrupt TPS, cadence, the
 * double-turn merge window, and replay pacing for exactly the fast
 * solving/heavy BLE traffic this happens under.
 *
 * The host timestamp is when the notification *arrived*, which is after the
 * burst's last move, not its first — so the burst can't be anchored forward
 * from its first move (that pushes the later moves past the arrival, and a
 * burst that ends the solve inflates the final time). Moves come in one at a
 * time here, so instead each is placed relative to the move before it by the
 * cube-clock gap, which anchors the whole burst back from where the previous
 * notification left off, and given `arrivalMs` it can never land later than
 * the notification that carried it. Times never run backwards.
 */
export interface BurstTimestampState {
  timestamp: number;
  cubeTimestamp: number | null;
  correctedTimestamp: number;
}

/** A first move of a new notification is placed by the cube clock only when the gap to the last move is this short (a pause is better read off the host clock). */
const MAX_CHAIN_GAP_MS = 1000;
/** ...and only while it agrees with the host clock to within this much (a notification that old means the cube clock isn't to be trusted). */
const MAX_ARRIVAL_LAG_MS = 500;

export function correctBurstTimestamp(
  prev: BurstTimestampState | null,
  /** `arrivalMs`: when the notification carrying this move reached the host — no move happened after it. */
  event: { timestamp: number; cubeTimestamp?: number | null; arrivalMs?: number | null },
): BurstTimestampState {
  const cubeTimestamp = event.cubeTimestamp ?? null;
  const arrivalMs = event.arrivalMs ?? null;
  let corrected = event.timestamp;
  if (prev && cubeTimestamp !== null && prev.cubeTimestamp !== null) {
    const gap = cubeTimestamp - prev.cubeTimestamp;
    // A negative gap is the cube's counter wrapping or restarting: nothing to learn from it.
    if (gap >= 0) {
      const chained = prev.correctedTimestamp + gap;
      if (event.timestamp === prev.timestamp) corrected = chained;
      else if (arrivalMs !== null && gap <= MAX_CHAIN_GAP_MS && event.timestamp - chained <= MAX_ARRIVAL_LAG_MS) corrected = chained;
    }
  }
  if (arrivalMs !== null) corrected = Math.min(corrected, arrivalMs);
  if (prev) corrected = Math.max(corrected, prev.correctedTimestamp);
  return { timestamp: event.timestamp, cubeTimestamp, correctedTimestamp: corrected };
}
