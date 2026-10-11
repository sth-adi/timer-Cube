import { describe, expect, it } from "vitest";
import { parseMove } from "@/lib/cube-engine/stickerTurns";
import { CUBIE_LAYOUT, blurTrail, cubieTurns, easeTurn, easeTurnSlope, fillToHex, ghostOpacity, liftColor, rotateAbout, stickerJitter, toneColor, turnSpeedPerFrame, ASSUMED_TURN_FRAMES } from "./layout";

const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe("cubie layout", () => {
  it("has 26 cubies carrying 54 stickers, one facelet each", () => {
    expect(CUBIE_LAYOUT).toHaveLength(26);
    const idx = CUBIE_LAYOUT.flatMap((c) => c.stickers.map((s) => s.index)).sort((a, b) => a - b);
    expect(idx).toEqual(Array.from({ length: 54 }, (_, i) => i));
  });
  it("draws U up, F toward the viewer and R to the right (y flipped from CSS)", () => {
    const u = CUBIE_LAYOUT.find((c) => c.stickers.some((s) => s.index === 4))!;
    const f = CUBIE_LAYOUT.find((c) => c.stickers.some((s) => s.index === 22))!;
    const r = CUBIE_LAYOUT.find((c) => c.stickers.some((s) => s.index === 13))!;
    expect(u.pos).toEqual([0, 1, 0]);
    expect(f.pos).toEqual([0, 0, 1]);
    expect(r.pos).toEqual([1, 0, 0]);
  });
});

describe("cubieTurns", () => {
  it("turns exactly the layer's nine cubies for a face move, none without a turn", () => {
    expect(cubieTurns(null, 0.5).every((t) => t === null)).toBe(true);
    const t = cubieTurns(parseMove("R"), 0.5);
    expect(t.filter(Boolean)).toHaveLength(9);
    expect(cubieTurns(parseMove("M"), 0.5).filter(Boolean)).toHaveLength(8);
    expect(cubieTurns(parseMove("y"), 0.5).filter(Boolean)).toHaveLength(26);
  });
  it("lands each cubie where stickerTurns says a clockwise face turn takes it", () => {
    // R clockwise: the front-right cubie (CSS 1,0,1) goes to the top-right (CSS 1,-1,0)
    const turns = cubieTurns(parseMove("R"), 1);
    const i = CUBIE_LAYOUT.findIndex((c) => c.css.join() === "1,0,1");
    const t = turns[i]!;
    const p = rotateAbout(t.axis, t.angle, CUBIE_LAYOUT[i].pos);
    expect(near(p, [1, 1, 0])).toBe(true);
    // U clockwise (seen from above): the front-top cubie goes to the left-top
    const u = cubieTurns(parseMove("U"), 1);
    const j = CUBIE_LAYOUT.findIndex((c) => c.css.join() === "0,-1,1");
    const q = rotateAbout(u[j]!.axis, u[j]!.angle, CUBIE_LAYOUT[j].pos);
    expect(near(q, [-1, 1, 0])).toBe(true);
    // F clockwise: the top-front cubie goes to the right-front
    const f = cubieTurns(parseMove("F"), 1);
    const k = CUBIE_LAYOUT.findIndex((c) => c.css.join() === "0,-1,1");
    const w = rotateAbout(f[k]!.axis, f[k]!.angle, CUBIE_LAYOUT[k].pos);
    expect(near(w, [1, 0, 1])).toBe(true);
  });
  it("starts a lagging pair half late and ends both together", () => {
    const pair = { pair: [{ face: "R", quarters: -1 }, { face: "L", quarters: 1 }], lag: 0.5 } as const;
    const early = cubieTurns(pair, 0.4).filter(Boolean);
    expect(early.some((t) => t!.angle === 0)).toBe(true);
    const end = cubieTurns(pair, 1).filter(Boolean);
    expect(new Set(end.map((t) => t!.angle.toFixed(6))).size).toBe(1);
  });
});

describe("easing", () => {
  it("is 0 to 1, monotonic, with a slope that matches", () => {
    expect(easeTurn(0)).toBe(0);
    expect(easeTurn(1)).toBe(1);
    expect(easeTurn(0.5)).toBeCloseTo(0.5);
    for (const t of [0.1, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95]) expect((easeTurn(t + 1e-6) - easeTurn(t - 1e-6)) / 2e-6).toBeCloseTo(easeTurnSlope(t), 3);
  });

  it("settles: goes a little past the quarter turn, then ends at exactly 1 with no speed", () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeTurn(i / 100)));
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.05);
    expect(easeTurnSlope(1)).toBeCloseTo(0, 6);
    expect(easeTurnSlope(0)).toBe(0);
    // it never runs backwards early: monotonic up to the settle
    for (let i = 1; i <= 80; i++) expect(easeTurn(i / 100)).toBeGreaterThanOrEqual(easeTurn((i - 1) / 100));  });
});

describe("colours", () => {
  it("lifts toward bright without leaving 0..1", () => {
    const [r, g, b] = liftColor("#e0332f");
    expect(r).toBeGreaterThan(0xe0 / 255);
    expect(g).toBeGreaterThan(0x33 / 255);
    expect(liftColor("#ffffff").every((v) => v === 1)).toBe(true);
    expect(b).toBeLessThanOrEqual(1);
  });
  it("gives stickers a steady, bounded tone variation", () => {
    expect(stickerJitter(7)).toBe(stickerJitter(7));
    for (let i = 0; i < 54; i++) expect(Math.abs(stickerJitter(i))).toBeLessThanOrEqual(1);
    expect(new Set(Array.from({ length: 54 }, (_, i) => stickerJitter(i))).size).toBeGreaterThan(30);
    const a = toneColor("#1fa64c", 3);
    const b = toneColor("#1fa64c", 4);
    expect(a).not.toEqual(b);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(0.1);
  });
});

describe("blur", () => {
  it("has no trail when slow and a short trail behind the layer when fast", () => {
    expect(blurTrail(1, 0.01)).toEqual([]);
    const t = blurTrail(1, 0.2, 3);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeLessThan(1);
    expect(t[2]).toBeLessThan(t[0]);
    const back = blurTrail(-1, -0.2, 3);
    expect(back[0]).toBeGreaterThan(-1);
  });
  it("caps the sweep and fades ghosts", () => {
    const t = blurTrail(0, 5, 4);
    expect(Math.abs(t[3])).toBeLessThanOrEqual(0.34 + 1e-9);
    expect(ghostOpacity(0, 3, 0.3)).toBeGreaterThan(ghostOpacity(2, 3, 0.3));
    expect(ghostOpacity(0, 3, 0.01)).toBe(0);
    expect(ghostOpacity(0, 3, 9)).toBeLessThanOrEqual(0.1);
  });
});


describe("fillToHex", () => {
  it("reads the CSS colours stickerFills carries", () => {
    expect(fillToHex("rgb(255,128,0)")).toBe("#ff8000");
    expect(fillToHex("rgb( 10 , 20 , 30 )")).toBe("#0a141e");
    expect(fillToHex("#AABBCC")).toBe("#aabbcc");
    expect(fillToHex("rgb(300,0,0)")).toBe("#ff0000");
  });
  it("is null for anything else", () => {
    expect(fillToHex(undefined)).toBeNull();
    expect(fillToHex("")).toBeNull();
    expect(fillToHex("red")).toBeNull();
  });
});

describe("turnSpeedPerFrame", () => {
  it("falls back to the assumed duration without a real one", () => {
    expect(turnSpeedPerFrame(3)).toBeCloseTo(3 / ASSUMED_TURN_FRAMES);
    expect(turnSpeedPerFrame(3, undefined)).toBeCloseTo(3 / ASSUMED_TURN_FRAMES);
    expect(turnSpeedPerFrame(3, NaN)).toBeCloseTo(3 / ASSUMED_TURN_FRAMES);
  });
  it("is faster the shorter the turn and keeps the sign", () => {
    expect(turnSpeedPerFrame(3, 100)).toBeGreaterThan(turnSpeedPerFrame(3, 300));
    expect(turnSpeedPerFrame(-3, 100)).toBeCloseTo(-turnSpeedPerFrame(3, 100));
    expect(turnSpeedPerFrame(3, 100)).toBeCloseTo((3 * 1000) / 60 / 100);
  });
  it("a fast turn blurs more than a slow one", () => {
    const sweep = (ms: number) => Math.abs(blurTrail(0, turnSpeedPerFrame(2, ms), 2)[1] ?? 0);
    expect(sweep(80)).toBeGreaterThan(sweep(200));
    expect(blurTrail(0, turnSpeedPerFrame(2, 1500), 2)).toEqual([]);
  });
});
