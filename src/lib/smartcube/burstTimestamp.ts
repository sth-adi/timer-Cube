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
 */
export interface BurstTimestampState {
  timestamp: number;
  cubeTimestamp: number | null;
  correctedTimestamp: number;
}

export function correctBurstTimestamp(prev: BurstTimestampState | null, event: { timestamp: number; cubeTimestamp?: number | null }): BurstTimestampState {
  const cubeTimestamp = event.cubeTimestamp ?? null;
  const correctedTimestamp =
    prev && event.timestamp === prev.timestamp && cubeTimestamp !== null && prev.cubeTimestamp !== null
      ? prev.correctedTimestamp + (cubeTimestamp - prev.cubeTimestamp)
      : event.timestamp;
  return { timestamp: event.timestamp, cubeTimestamp, correctedTimestamp };
}
