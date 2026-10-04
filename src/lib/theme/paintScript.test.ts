import { describe, expect, it } from "vitest";
import { PAINT_SETTINGS_SCRIPT } from "./paintScript";
import { FX_LEVELS, THEMES } from "@/lib/store/settingsStore";

function run(stored: string | null | "throw") {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem: () => {
      if (stored === "throw") throw new Error("blocked");
      return stored;
    },
  };
  const document = { documentElement: { dataset } };
  new Function("localStorage", "document", PAINT_SETTINGS_SCRIPT)(localStorage, document);
  return dataset;
}

describe("PAINT_SETTINGS_SCRIPT", () => {
  it("applies a stored theme and fx level", () => {
    expect(run(JSON.stringify({ state: { theme: "paper", fxLevel: "off" }, version: 2 }))).toEqual({
      theme: "paper",
      fxLevel: "off",
    });
  });

  it("knows every theme and fx level the store does", () => {
    for (const t of THEMES) expect(run(JSON.stringify({ state: { theme: t.id } })).theme).toBe(t.id);
    for (const f of FX_LEVELS) expect(run(JSON.stringify({ state: { fxLevel: f.id } })).fxLevel).toBe(f.id);
  });

  it("maps the legacy light theme to paper", () => {
    expect(run(JSON.stringify({ state: { theme: "light" }, version: 1 })).theme).toBe("paper");
  });

  it("does nothing for empty, invalid or blocked storage", () => {
    expect(run(null)).toEqual({});
    expect(run("not json")).toEqual({});
    expect(run("null")).toEqual({});
    expect(run(JSON.stringify({ state: { theme: "bogus", fxLevel: 3 } }))).toEqual({});
    expect(run("throw")).toEqual({});
  });
});
