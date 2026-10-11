/**
 * Browsers allow only a handful of live WebGL contexts per page (past ~8-16 the oldest is killed), and a phone far fewer.
 * Several cubes can be mounted at once (the live cube, the mimic behind a replay sheet, the settings preview, a gyro twin),
 * so at most `max` of them hold a context. A cube that is not on screen gives its context up when another needs one; a cube
 * that cannot get one shows its CSS fallback and is told to try again when a slot frees up.
 */

export interface PoolClient {
  /** is the cube on screen right now (only an off-screen holder can be evicted) */
  visible(): boolean;
  /** give the context up: dispose the scene and show the fallback */
  evict(): void;
  /** a slot is free: try to acquire again */
  retry(): void;
}

export class ContextPool {
  private held = new Set<PoolClient>();
  private waiting = new Set<PoolClient>();

  constructor(readonly max = 3) {}

  get size(): number {
    return this.held.size;
  }

  /** True when `c` now holds a context. When full, the oldest off-screen holder is evicted for it; with every holder on screen, `c` waits. */
  acquire(c: PoolClient): boolean {
    if (this.held.has(c)) return true;
    this.waiting.delete(c);
    if (this.held.size >= this.max) {
      const victim = [...this.held].find((h) => !h.visible());
      if (!victim) {
        this.waiting.add(c);
        return false;
      }
      this.held.delete(victim);
      this.waiting.add(victim);
      victim.evict();
    }
    this.held.add(c);
    return true;
  }

  /** `c` is gone or stops wanting a context. The first visible waiter is told a slot is free. */
  release(c: PoolClient): void {
    this.waiting.delete(c);
    if (!this.held.delete(c)) return;
    for (const w of this.waiting) {
      if (!w.visible()) continue;
      this.waiting.delete(w);
      w.retry();
      break;
    }
  }
}

/** The page-wide pool every Cube3D shares. */
export const contextPool = new ContextPool(3);
