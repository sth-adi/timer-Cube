import { describe, expect, it } from "vitest";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { pendingColor, progressFills } from "./progressFill";

const rgb = (css: string) => css.match(/\d+/g)!.map(Number);
const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

describe("pendingColor", () => {
  it("is darker and less saturated than the sticker's own colour", () => {
    for (const letter of "URFDLB") {
      const own = parseInt(FACELET_COLORS[letter].slice(1), 16);
      const [r, g, b] = rgb(pendingColor(letter, "0,0,1"));
      const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
      expect(spread([r, g, b])).toBeLessThan(spread([(own >> 16) & 255, (own >> 8) & 255, own & 255]) + 1);
      expect(r + g + b).toBeLessThan(((own >> 16) & 255) + ((own >> 8) & 255) + (own & 255));
    }
  });

  it("keeps the colours distinguishable from one another", () => {
    const seen = new Set("URFDLB".split("").map((l) => pendingColor(l, "0,0,1")));
    expect(seen.size).toBe(6);
  });
});

describe("progressFills", () => {
  it("fills only pending stickers", () => {
    const pending = Array.from({ length: 54 }, (_, i) => i === 4 || i === 20);
    const fills = progressFills(SOLVED, pending);
    expect(fills).toHaveLength(54);
    expect(fills.filter((f) => f !== undefined)).toHaveLength(2);
    expect(fills[4]).toBe(pendingColor("U", "0,-1,0"));
  });
});
