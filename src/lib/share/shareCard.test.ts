import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionStats } from "@/lib/stats/stats";
import { drawShareCard, heroFor, statCells, trendSeries } from "./shareCard";
import { drawDnaCard, drawDnaTimelineCard, extremes } from "./dnaCard";

function stats(over: Partial<SessionStats> = {}): SessionStats {
  return {
    count: 30,
    solveCount: 29,
    dnfCount: 1,
    best: 8420,
    worst: 15000,
    mean: 11230,
    ao5: 10500,
    ao12: 10900,
    ao50: null,
    ao100: null,
    bestAo5: 10100,
    bestAo12: 10700,
    stdDev: 1500,
    ao5Dnf: false,
    ao12Dnf: false,
    ao50Dnf: false,
    ao100Dnf: false,
    bestAo5Dnf: false,
    bestAo12Dnf: false,
    ...over,
  };
}

describe("hero and cells", () => {
  it("leads with ao12, then ao5, then the best single", () => {
    expect(heroFor(stats())).toEqual({ label: "Average of 12", value: "10.90" });
    expect(heroFor(stats({ ao12: null }))).toEqual({ label: "Average of 5", value: "10.50" });
    expect(heroFor(stats({ ao12: null, ao5: null, count: 1, solveCount: 1, dnfCount: 0 }))).toEqual({ label: "Best single", value: "8.42" });
  });

  it("copes with no solves and with only DNFs", () => {
    const empty = stats({ count: 0, solveCount: 0, dnfCount: 0, best: null, worst: null, mean: null, ao5: null, ao12: null });
    expect(heroFor(empty).value).toBe("—");
    const dnfs = stats({ count: 3, solveCount: 0, dnfCount: 3, best: null, worst: null, mean: null, ao5: null, ao12: null });
    expect(heroFor(dnfs)).toEqual({ label: "No finished solve yet", value: "DNF" });
  });

  it("never repeats the hero, never shows an empty dash, and ends on the solve count", () => {
    const cells = statCells(stats());
    expect(cells.map((c) => c.label)).toEqual(["Best", "ao5", "Mean", "Solves · 1 DNF"]);
    expect(cells.every((c) => c.value !== "—")).toBe(true);
    expect(cells.length).toBeLessThanOrEqual(4);
  });

  it("shows a DNF average as a DNF, and a 1-solve session as just its count", () => {
    const withDnf = statCells(stats({ ao12: null, ao5: 10500, ao12Dnf: true }));
    expect(withDnf.find((c) => c.label === "ao12")).toMatchObject({ value: "DNF", bad: true });
    const one = statCells(stats({ count: 1, solveCount: 1, dnfCount: 0, ao5: null, ao12: null, mean: 8420 }));
    expect(one).toEqual([{ label: "Solve", value: "1" }]);
  });

  it("cleans the trend series", () => {
    expect(trendSeries([1, Infinity, NaN, null, 5], 3)).toEqual([null, null, 5]);
    expect(trendSeries(undefined)).toEqual([]);
    expect(trendSeries(Array.from({ length: 100 }, (_, i) => i)).length).toBe(40);
  });
});

describe("dna extremes", () => {
  it("finds the strongest and weakest axis", () => {
    const e = extremes([{ label: "Speed", score: 80 }, { label: "Volume", score: 20 }, { label: "Consistency", score: 55 }]);
    expect(e?.best.label).toBe("Speed");
    expect(e?.worst.label).toBe("Volume");
  });
  it("has none when there is nothing to compare", () => {
    expect(extremes([{ label: "Speed", score: 50 }])).toBeNull();
    expect(extremes([{ label: "A", score: 50 }, { label: "B", score: 50 }])).toBeNull();
  });
});

// A recording 2D context: text is 0.55em per glyph (+ letter-spacing), so overflow is checkable without a browser.
interface TextCall {
  text: string;
  x: number;
  align: string;
  width: number;
}
function fakeDom() {
  const texts: TextCall[] = [];
  const canvases: { width: number; height: number }[] = [];
  const state: Record<string, unknown> = { font: "500 20px sans", textAlign: "left", letterSpacing: "0px" };
  const grad = { addColorStop() {} };
  const ctx: unknown = new Proxy(state, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      if (prop === "measureText") {
        return (s: string) => {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font))?.[1] ?? 20);
          const ls = parseFloat(String(t.letterSpacing)) || 0;
          return { width: Array.from(s).length * (px * 0.55 + ls) };
        };
      }
      if (prop === "fillText") {
        return (s: string, x: number) => {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font))?.[1] ?? 20);
          const ls = parseFloat(String(t.letterSpacing)) || 0;
          texts.push({ text: s, x, align: String(t.textAlign), width: Array.from(s).length * (px * 0.55 + ls) });
        };
      }
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => grad;
      if (prop === "createPattern") return () => ({ setTransform() {} });
      if (prop === "createImageData") return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => undefined;
    },
    set(t, prop: string, v) {
      t[prop] = v;
      return true;
    },
  });
  const doc = {
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => ctx, toBlob: () => undefined };
      canvases.push(c);
      return c;
    },
  };
  return { doc, texts, canvases };
}

describe("drawing never overflows the card", () => {
  const g = globalThis as unknown as { document?: unknown; DOMMatrix?: unknown };
  let dom: ReturnType<typeof fakeDom>;
  beforeEach(() => {
    dom = fakeDom();
    g.document = dom.doc;
    g.DOMMatrix = class {
      scale() {
        return this;
      }
    };
  });
  afterEach(() => {
    delete g.document;
    delete g.DOMMatrix;
  });

  const within = (w: number, margin: number) => {
    for (const t of dom.texts) {
      const left = t.align === "right" ? t.x - t.width : t.align === "center" ? t.x - t.width / 2 : t.x;
      const right = left + t.width;
      expect(left, t.text).toBeGreaterThanOrEqual(margin - 6);
      expect(right, t.text).toBeLessThanOrEqual(w - margin + 6);
    }
  };

  const long = "An extremely long session name that would never fit on one line of the share image";
  const dna = [
    { label: "Speed", score: 88 },
    { label: "Consistency", score: 64 },
    { label: "Volume", score: 12 },
    { label: "Cross", score: 71 },
    { label: "F2L", score: 55 },
  ];

  it("stats card, portrait and link, long names, DNFs, no ao12", () => {
    for (const format of ["portrait", "link"] as const) {
      dom.texts.length = 0;
      const canvas = drawShareCard({
        sessionName: long,
        stats: stats({ ao12: null, ao12Dnf: true, best: 61234, mean: 1234567 }),
        format,
        username: "a_really_long_username",
        recent: [12000, null, 11000, 10000, Infinity, 9500, 9000],
        phases: [
          { label: "Cross", share: 0.12, meanMs: 1200 },
          { label: "F2L", share: 0.5, meanMs: 5000 },
          { label: "OLL", share: 0.2, meanMs: 2000 },
          { label: "PLL", share: 0.18, meanMs: 1800 },
        ],
        date: new Date(2026, 9, 6),
      });
      const w = format === "portrait" ? 1080 : 1200;
      expect(canvas.width).toBe(format === "portrait" ? 1080 : 2400);
      expect(dom.texts.length).toBeGreaterThan(8);
      within(w, format === "portrait" ? 80 : 60);
    }
  });

  it("a one-solve session draws too", () => {
    drawShareCard({ sessionName: "Session 1", stats: stats({ count: 1, solveCount: 1, dnfCount: 0, ao5: null, ao12: null }), recent: [8420] });
    expect(dom.texts.map((t) => t.text)).toContain("8.42");
  });

  it("dna cards, portrait and link", () => {
    for (const format of ["portrait", "link"] as const) {
      dom.texts.length = 0;
      drawDnaCard({ sessionName: long, axes: dna, format, username: "someone_with_a_long_name" });
      within(format === "portrait" ? 1080 : 1200, format === "portrait" ? 80 : 60);
      dom.texts.length = 0;
      drawDnaTimelineCard({
        sessionName: long,
        headline: "Your Speed has climbed every month since March and your Consistency finally caught up with it in September.",
        snapshots: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((label, i) => ({ label, axes: dna.map((a) => ({ ...a, score: a.score - 5 + i })), trait: { name: "The Steady Machinist" }, meanMs: 14000 - i * 400 })),
        format,
      });
      within(format === "portrait" ? 1080 : 1200, format === "portrait" ? 80 : 60);
    }
  });
});
