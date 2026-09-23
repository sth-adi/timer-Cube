import type { Penalty } from "@/types";

/**
 * The keyboard/touch timer as a plain state machine with the clock passed
 * in. Every transition takes `now` (ms, any monotonic clock), so the exact
 * behaviour at the boundaries — the 15s and 17s inspection limits, a hold
 * released one millisecond before it arms, a repeated keydown, a cancelled
 * touch — can be tested directly, and the React hook (useTimer) is only
 * scheduling and rendering around it.
 *
 *   idle ─press→ inspecting (inspection on) or holding
 *   holding/inspecting ─held holdToStartMs→ ready ─release→ running
 *   holding ─early release or cancel→ idle
 *   ready ─cancel→ inspecting (inspection keeps counting) or idle
 *   running ─press→ (split marks, then) stopped
 */

export type TimerPhase = "idle" | "inspecting" | "holding" | "ready" | "running" | "stopped";

/** WCA inspection: 15 seconds. */
export const INSPECTION_MS = 15_000;
/** WCA A3a: starting after 15s is +2; after 17s the attempt is DNF. */
export const INSPECTION_DNF_MS = 17_000;

/**
 * The penalty for starting a solve `elapsedMs` into inspection. Exactly 15s
 * is still on time and exactly 17s is still +2: WCA penalises *over* each limit.
 */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs <= INSPECTION_MS) return "none";
  if (elapsedMs <= INSPECTION_DNF_MS) return "plus2";
  return "dnf";
}

export interface InspectionResult {
  /** From the start of inspection to the moment the solve started. */
  elapsedMs: number;
  penalty: Penalty;
}

export interface TimerResult {
  timeMs: number;
  splits: number[];
  /** Null when inspection was off for this attempt. */
  inspection: InspectionResult | null;
  /** The penalty the attempt should be saved with. */
  penalty: Penalty;
}

export interface TimerOptions {
  inspectionEnabled: boolean;
  holdToStartMs: number;
  /** 1 = an ordinary timer; n > 1 = the first n−1 presses while running mark phase splits. */
  phaseCount: number;
}

export class TimerMachine {
  phase: TimerPhase = "idle";
  splits: number[] = [];
  lastResult: TimerResult | null = null;
  private holdStartedAt: number | null = null;
  private runStartedAt: number | null = null;
  private inspectionStartedAt: number | null = null;
  private inspection: InspectionResult | null = null;
  private stoppedMs = 0;

  constructor(private opts: TimerOptions) {}

  setOptions(opts: TimerOptions): void {
    this.opts = opts;
  }

  /** When the current hold will arm, or null if nothing is being held. */
  get armAt(): number | null {
    if ((this.phase !== "holding" && this.phase !== "inspecting") || this.holdStartedAt === null) return null;
    return this.holdStartedAt + this.opts.holdToStartMs;
  }

  /** Time shown on the clock. */
  displayMs(now: number): number {
    if (this.phase === "running" && this.runStartedAt !== null) return Math.max(0, now - this.runStartedAt);
    if (this.phase === "stopped") return this.stoppedMs;
    return 0;
  }

  get inspecting(): boolean {
    return this.inspectionStartedAt !== null && (this.phase === "inspecting" || this.phase === "holding" || this.phase === "ready");
  }

  inspectionElapsedMs(now: number): number {
    return this.inspectionStartedAt === null ? 0 : Math.max(0, now - this.inspectionStartedAt);
  }

  inspectionRemainingMs(now: number): number {
    return Math.max(0, INSPECTION_MS - this.inspectionElapsedMs(now));
  }

  /** The penalty a solve would get if it started right now. */
  pendingPenalty(now: number): Penalty {
    return this.inspectionStartedAt === null ? "none" : inspectionPenalty(this.inspectionElapsedMs(now));
  }

  /** Arms a hold that has lasted long enough. Called on every frame and before release. */
  tick(now: number): void {
    const armAt = this.armAt;
    if (armAt !== null && this.holdStartedAt !== null && now >= armAt) this.phase = "ready";
  }

  /** keydown(space) / touchstart. Returns the result when this press finishes a solve. */
  press(now: number): TimerResult | null {
    switch (this.phase) {
      case "running": {
        const elapsed = Math.round(now - (this.runStartedAt ?? now));
        if (this.splits.length < this.opts.phaseCount - 1) {
          this.splits = [...this.splits, elapsed];
          return null;
        }
        this.stoppedMs = elapsed;
        this.phase = "stopped";
        const inspection = this.inspection;
        const result: TimerResult = { timeMs: elapsed, splits: this.splits, inspection, penalty: inspection?.penalty ?? "none" };
        this.lastResult = result;
        return result;
      }
      case "idle":
      case "stopped":
        this.splits = [];
        this.stoppedMs = 0;
        this.inspection = null;
        this.lastResult = null;
        this.inspectionStartedAt = this.opts.inspectionEnabled ? now : null;
        this.holdStartedAt = now;
        this.phase = this.opts.inspectionEnabled ? "inspecting" : "holding";
        return null;
      case "inspecting":
        // A press after starting inspection: the solver has already engaged
        // once, so this arms immediately rather than making them wait out
        // another full hold.
        this.holdStartedAt = now;
        this.phase = "ready";
        return null;
      default:
        // holding / ready: a repeated keydown (auto-repeat, a second finger) changes nothing.
        return null;
    }
  }

  /** keyup(space) / touchend. */
  release(now: number): void {
    this.tick(now);
    switch (this.phase) {
      case "ready":
        this.inspection = this.inspectionStartedAt === null ? null : { elapsedMs: Math.round(now - this.inspectionStartedAt), penalty: inspectionPenalty(now - this.inspectionStartedAt) };
        this.inspectionStartedAt = null;
        this.holdStartedAt = null;
        this.runStartedAt = now;
        this.phase = "running";
        return;
      case "holding":
        // Let go before it armed, with no inspection running: back to idle.
        this.holdStartedAt = null;
        this.phase = "idle";
        return;
      default:
        // inspecting: let go before it armed — inspection keeps counting down.
        this.holdStartedAt = null;
    }
  }

  /**
   * The input was interrupted rather than released (touchcancel, the window
   * losing focus mid-hold). Never starts a solve: an armed timer goes back
   * to inspecting — the countdown and its penalties keep running — or idle.
   */
  cancel(): void {
    if (this.phase === "holding") {
      this.holdStartedAt = null;
      this.phase = "idle";
    } else if (this.phase === "ready" || this.phase === "inspecting") {
      this.holdStartedAt = null;
      this.phase = this.inspectionStartedAt !== null ? "inspecting" : "idle";
    }
  }

  reset(): void {
    this.phase = "idle";
    this.splits = [];
    this.holdStartedAt = null;
    this.runStartedAt = null;
    this.inspectionStartedAt = null;
    this.inspection = null;
    this.lastResult = null;
    this.stoppedMs = 0;
  }
}
