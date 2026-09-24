import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { decodeSealed, encodeSealed, open, seal, strengthBits, strengthLabel } from "./vault";

const stateOf = (moves: string) => {
  const c = new Cube();
  if (moves) c.move(moves);
  return c.asString();
};

describe("Cube Vault", () => {
  it("opens only with the exact cube state — any path to it works, a near miss doesn't", async () => {
    const key = stateOf("R U R' F2 D L'");
    const token = encodeSealed(await seal("meet at the comp, 9am", key, "six turns"));
    const sealed = decodeSealed(token)!;
    expect(sealed.hint).toBe("six turns");
    // Same state reached a different way (a full extra U cycle) still opens it.
    expect(await open(sealed, stateOf("R U R' F2 D L' U U U U"))).toBe("meet at the comp, 9am");
    expect(await open(sealed, stateOf("R U R' F2 D L"))).toBeNull();
    expect(await open(sealed, stateOf(""))).toBeNull();
  });

  it("round-trips unicode and rejects a tampered or malformed token", async () => {
    const key = stateOf("F B'");
    const token = encodeSealed(await seal("🧊 cubing ≠ easy", key));
    expect(await open(decodeSealed(token)!, key)).toBe("🧊 cubing ≠ easy");
    const parts = token.split(".");
    const flipped = parts[3][0] === "A" ? "B" + parts[3].slice(1) : "A" + parts[3].slice(1);
    const tampered = [...parts.slice(0, 3), flipped, parts[4]].join(".");
    expect(await open(decodeSealed(tampered)!, key)).toBeNull();
    expect(decodeSealed("garbage")).toBeNull();
    expect(decodeSealed("9.a.b.c.d")).toBeNull();
  });

  it("rates key strength by moves, capped at the size of the cube", () => {
    expect(strengthLabel(strengthBits(0))).toBe("none");
    expect(strengthLabel(strengthBits(3))).toBe("toy");
    expect(strengthLabel(strengthBits(10))).toBe("fair");
    expect(strengthBits(40)).toBeCloseTo(65.2);
    expect(strengthLabel(strengthBits(40))).toBe("max");
  });
});
