import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor, readThemeTokens, themeContrasts } from "./contrast";
import { THEMES } from "@/lib/store/settingsStore";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const css = read("src/app/globals.css");
const ids = THEMES.map((t) => t.id);
const c = (s: string) => parseColor(s)!;

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio(c("#000"), c("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(c("#fff"), c("#fff"))).toBeCloseTo(1, 5);
    expect(contrastRatio(c("#777777"), c("#ffffff"))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(c("#767676"), c("#ffffff"))).toBeCloseTo(4.54, 2);
  });

  it("parses hex and rgba and composites translucent colours", () => {
    expect(parseColor("#7c5cff")).toEqual({ r: 124, g: 92, b: 255, a: 1 });
    expect(parseColor("rgba(255, 255, 255, 0.5)")).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    expect(parseColor("var(--x)")).toBeNull();
    expect(over(c("rgba(255,255,255,0.5)"), c("#000"))).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });
});

describe("theme tokens", () => {
  const tokens = readThemeTokens(css, ids);

  it("reads every theme, inheriting the :root palette", () => {
    for (const id of ids) expect(tokens[id]["--background"], id).toBeTruthy();
    expect(tokens.nebula["--background"]).toBe("#08080f");
    expect(tokens.paper["--background"]).toBe("#f4f5f8");
    expect(tokens.mint["--border"]).toBe(tokens.nebula["--border"]);
  });

  for (const id of ids) {
    it(`${id}: every text colour is >= 4.5:1 on every surface it sits on`, () => {
      const low = themeContrasts(tokens[id]).filter((x) => x.ratio < 4.5);
      expect(low.map((x) => `${x.pair} = ${x.ratio.toFixed(2)}`)).toEqual([]);
    });
  }
});
