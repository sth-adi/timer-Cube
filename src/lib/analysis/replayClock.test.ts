import { describe, expect, it } from "vitest";
import { ReplayClock } from "./replayClock";

describe("ReplayClock", () => {
  it("runs at the tempo, holds when paused, seeks and stops at the end", () => {
    let t = 0;
    const c = new ReplayClock(() => t);
    c.setDuration(1000);
    c.play();
    t = 200;
    expect(c.now()).toBe(200);
    c.tempoScale = 2;
    c.timestamp = 300;
    t = 400;
    expect(c.now()).toBe(700);
    c.pause();
    t = 900;
    expect(c.now()).toBe(700);
    c.play();
    t = 2000;
    expect(c.now()).toBe(1000);
    expect(c.playing).toBe(false);
  });
});
