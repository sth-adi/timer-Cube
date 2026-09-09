/** Pure aggregation over a heart-rate sample log — kept separate from the store for easy testing. */

export interface HeartRateSample {
  timestampMs: number;
  bpm: number;
}

export interface HeartRateSummary {
  avg: number;
  max: number;
}

/** Summarizes every sample from `startMs` onward — i.e., "during this solve". */
export function summarizeHeartRate(samples: readonly HeartRateSample[], startMs: number): HeartRateSummary | null {
  const inWindow = samples.filter((s) => s.timestampMs >= startMs).map((s) => s.bpm);
  if (inWindow.length === 0) return null;
  return {
    avg: Math.round(inWindow.reduce((a, b) => a + b, 0) / inWindow.length),
    max: Math.max(...inWindow),
  };
}
