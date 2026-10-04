import { describe, expect, it } from "vitest";
import { GYRO_FRAME_PERSIST_MS, STILL_HOLD_MS, StillnessDetector, decideGyroHome } from "./homePose";
import type { Quat } from "./orientation";

const ID: Quat = { x: 0, y: 0, z: 0, w: 1 };
/** A rotation of `deg` degrees about z. */
function about(deg: number): Quat {
  const h = (deg * Math.PI) / 360;
  return { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) };
}

describe("decideGyroHome", () => {
  const resumed = { resumed: true, hasRef: true, sameCube: true, droppedForMs: 5_000 };

  it("takes the first sample on a fresh connect, whatever came before", () => {
    expect(decideGyroHome({ ...resumed, resumed: false })).toBe("first-sample");
    expect(decideGyroHome({ resumed: false, hasRef: false, sameCube: false, droppedForMs: null })).toBe("first-sample");
  });

  it("keeps the old reference when the same cube was only gone a moment", () => {
    expect(decideGyroHome(resumed)).toBe("keep");
    expect(decideGyroHome({ ...resumed, droppedForMs: GYRO_FRAME_PERSIST_MS })).toBe("keep");
  });

  it("waits for the cube to be still when the old reference can't be trusted", () => {
    expect(decideGyroHome({ ...resumed, hasRef: false })).toBe("await-still");
    expect(decideGyroHome({ ...resumed, sameCube: false })).toBe("await-still");
    expect(decideGyroHome({ ...resumed, droppedForMs: GYRO_FRAME_PERSIST_MS + 1 })).toBe("await-still");
    expect(decideGyroHome({ ...resumed, droppedForMs: null })).toBe("await-still");
    expect(decideGyroHome({ ...resumed, droppedForMs: -1 })).toBe("await-still");
  });
});

describe("StillnessDetector", () => {
  it("fires once the cube has stayed put long enough, not before", () => {
    const d = new StillnessDetector();
    expect(d.push({ atMs: 0, q: ID })).toBe(false);
    expect(d.push({ atMs: STILL_HOLD_MS - 1, q: about(1) })).toBe(false);
    expect(d.push({ atMs: STILL_HOLD_MS, q: about(1.5) })).toBe(true);
  });

  it("starts the wait over whenever the cube moves", () => {
    const d = new StillnessDetector();
    d.push({ atMs: 0, q: ID });
    expect(d.push({ atMs: 300, q: about(40) })).toBe(false); // moved: new anchor here
    expect(d.push({ atMs: 600, q: about(41) })).toBe(false); // only 300 ms since the move
    expect(d.push({ atMs: 700, q: about(41) })).toBe(true);
  });

  it("treats a clock that goes backwards as a restart", () => {
    const d = new StillnessDetector();
    d.push({ atMs: 5_000, q: ID });
    expect(d.push({ atMs: 100, q: ID })).toBe(false);
    expect(d.push({ atMs: 100 + STILL_HOLD_MS, q: ID })).toBe(true);
  });
});
