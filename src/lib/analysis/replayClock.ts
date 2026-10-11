/**
 * The replay's own clock for the 3D stage cube: stands in for cubing.js's player where there is none, with the
 * few members TimedCubePlayer uses (play, pause, a settable `timestamp`, `tempoScale`, and the async timestamp
 * read), so play, scrub and speed work the same on either. Position is ms on the replay's timeline; it runs at
 * `tempoScale` times real time and stops itself at the end.
 */
export class ReplayClock {
  private pos = 0;
  private at = 0;
  private running = false;
  private duration = 0;
  tempoScale = 1;
  private mul = 1;
  readonly virtual = true;
  readonly experimentalGet = { timestamp: async (): Promise<number> => this.now() };

  constructor(private readonly clock: () => number = () => performance.now()) {}

  /** Where the replay is right now. */
  now(): number {
    if (!this.running) return this.pos;
    const p = this.pos + (this.clock() - this.at) * this.tempoScale * this.mul;
    if (this.duration > 0 && p >= this.duration) {
      this.pos = this.duration;
      this.running = false;
      return this.pos;
    }
    return p;
  }

  /** A momentary slow-down factor on top of `tempoScale` (the Director's dip). Rebases first, so time already played keeps the rate it was played at. */
  get rateMul(): number {
    return this.mul;
  }

  set rateMul(v: number) {
    const next = v > 0 ? v : 1;
    if (next === this.mul) return;
    if (this.running) {
      this.pos = this.now();
      this.at = this.clock();
    }
    this.mul = next;
  }

  get playing(): boolean {
    this.now();
    return this.running;
  }

  setDuration(ms: number): void {
    this.duration = ms;
  }

  play(): void {
    if (this.running) return;
    if (this.duration > 0 && this.pos >= this.duration) this.pos = 0;
    this.at = this.clock();
    this.running = true;
  }

  pause(): void {
    this.pos = this.now();
    this.running = false;
  }

  get timestamp(): number {
    return this.now();
  }

  set timestamp(ms: number) {
    this.pos = Math.max(0, this.duration > 0 ? Math.min(this.duration, ms) : ms);
    this.at = this.clock();
  }
}
