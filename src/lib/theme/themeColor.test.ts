import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLOR_SCRIPT, THEME_COLORS, themeColorFor } from "./themeColor";
import { THEMES } from "@/lib/store/settingsStore";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--background` a theme block (or :root for the default) declares in globals.css. */
function cssBackground(theme: string): string | null {
  const selector = theme === "nebula" ? ":root {" : `:root[data-theme="${theme}"] {`;
  const start = css.indexOf(selector);
  if (start < 0) return null;
  const block = css.slice(start, css.indexOf("\n}", start));
  return block.match(/--background:\s*(#[0-9a-fA-F]{6})/)?.[1].toLowerCase() ?? null;
}

describe("theme colours", () => {
  it("has one for every theme, matching the theme's page background", () => {
    for (const t of THEMES) {
      expect(THEME_COLORS[t.id], t.id).toBeDefined();
      const bg = cssBackground(t.id);
      // The dark themes that only restyle the accent inherit the :root background.
      expect(THEME_COLORS[t.id], t.id).toBe(bg ?? THEME_COLORS.nebula);
    }
  });

  it("falls back to the default theme's colour", () => {
    expect(themeColorFor("bogus")).toBe(THEME_COLORS.nebula);
    expect(themeColorFor(undefined)).toBe(THEME_COLORS.nebula);
    expect(themeColorFor("paper")).toBe("#eef0f4");
  });

  it("the inline script sets every theme-color meta from <html data-theme>", () => {
    const metas = [{ content: "" }, { content: "" }];
    const setAttr = (m: { content: string }) => (_: string, v: string) => void (m.content = v);
    const els = metas.map((m) => ({ ...m, setAttribute: setAttr(m) }));
    const document = { documentElement: { dataset: { theme: "paper" } }, querySelectorAll: () => els, head: {}, createElement: () => ({}) };
    new Function("document", THEME_COLOR_SCRIPT)(document);
    // setAttribute above mutates the copies' closures' source objects
    expect(metas.map((m) => m.content)).toEqual(["#eef0f4", "#eef0f4"]);
  });
});
