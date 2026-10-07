import { describe, expect, it } from "vitest";
import { faceletForCubingColor, hexToUnit, recolorPlayer } from "./cubeColors";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";

describe("cubing.js colour mapping", () => {
  it("recognises each cubing.js sticker colour and nothing else", () => {
    expect(faceletForCubingColor(1, 1, 1)).toBe("U");
    expect(faceletForCubingColor(0, 1, 0)).toBe("F");
    expect(faceletForCubingColor(1, 0, 0)).toBe("R");
    expect(faceletForCubingColor(1, 1, 0)).toBe("D");
    expect(faceletForCubingColor(1, 0.6, 0)).toBe("L");
    expect(faceletForCubingColor(0.133, 0.4, 1)).toBe("B");
    expect(faceletForCubingColor(0, 0, 0)).toBeNull();
    expect(faceletForCubingColor(0.27, 0.67, 0.3)).toBeNull();
  });

  it("converts hex to unit channels", () => {
    expect(hexToUnit("#ff8000")[0]).toBe(1);
    expect(hexToUnit("#000000")).toEqual([0, 0, 0]);
  });

  it("recolours shared materials once and asks for a render; tolerates a missing object", async () => {
    const mk = (r: number, g: number, b: number) => ({ color: { r, g, b, setRGB(nr: number, ng: number, nb: number) { this.r = nr; this.g = ng; this.b = nb; } } });
    const green = mk(0, 1, 0);
    const black = { ...mk(0, 0, 0), opacity: 0.3, transparent: true, needsUpdate: false };
    let renders = 0;
    const obj = { traverse: (cb: (o: { material?: unknown }) => void) => [green, green, black].forEach((m) => cb({ material: m })), scheduleRenderCallback: () => renders++ };
    await recolorPlayer({ experimentalCurrentThreeJSPuzzleObject: async () => obj });
    expect([green.color.r, green.color.g, green.color.b]).toEqual(hexToUnit(FACELET_COLORS.F));
    expect(black.opacity).toBe(1);
    expect(black.transparent).toBe(false);
    expect(black.needsUpdate).toBe(true);
    expect(renders).toBe(1);
    await expect(recolorPlayer({})).resolves.toBeUndefined();
    await expect(recolorPlayer({ experimentalCurrentThreeJSPuzzleObject: async () => { throw new Error("x"); } })).resolves.toBeUndefined();
  });
});
