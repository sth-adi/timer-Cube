import { describe, expect, it } from "vitest";
import { cleanName, compareCards, decodeCard, encodeCard, type DuelCard } from "./duel";

const card = (over: Partial<DuelCard> = {}): DuelCard => ({
  v: 1,
  name: "Me",
  at: 1_790_000_000_000,
  count: 900,
  averageMs: 14000,
  bestMs: 9800,
  phases: { Cross: 2200, F2L: 7000, OLL: 2400, PLL: 2400 },
  tps: 5.1,
  axes: [
    { label: "Speed", score: 70 },
    { label: "Consistency", score: 80 },
    { label: "Volume", score: 100 },
  ],
  trait: "The Metronome",
  ...over,
});

describe("DNA Duel", () => {
  it("round-trips a card through its link, unicode names included", () => {
    const c = card({ name: "Zoë 🧊" });
    const code = encodeCard(c);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCard(code)).toEqual(c);
    expect(decodeCard(`https://example.com/duel#c=${code}`)).toEqual(c);
  });

  it("rejects malformed or hostile codes", () => {
    expect(decodeCard("")).toBeNull();
    expect(decodeCard("not base64!!")).toBeNull();
    expect(decodeCard(btoa(JSON.stringify({ v: 2 })).replace(/=/g, ""))).toBeNull();
    const bad = encodeCard(card()).slice(0, 20);
    expect(decodeCard(bad)).toBeNull();
    expect(cleanName("<script>x</script>")).toBe("scriptx/script");
    expect(cleanName("   ")).toBe("A cuber");
  });

  it("puts the numbers side by side and finds where the gap is", () => {
    const them = card({ name: "Sam", averageMs: 12900, phases: { Cross: 2100, F2L: 6100, OLL: 2300, PLL: 2600 }, tps: 6.0 });
    const r = compareCards(card(), them);
    expect(r.headline).toBe("Sam is 1.10s faster on average — 0.90s of it in F2L.");
    expect(r.rows.find((x) => x.label === "F2L")!.edge).toBe("them");
    expect(r.rows.find((x) => x.label === "PLL")!.edge).toBe("me");
    expect(r.rows.find((x) => x.label === "Cross")!.edge).toBe("them");
    expect(r.steal[0]).toMatch(/^F2L: theirs is 0.90s faster/);
    expect(r.steal.join(" ")).toMatch(/6.0 TPS/);
    expect(r.teach[0]).toMatch(/^PLL: yours is 0.20s faster/);
  });

  it("doesn't call a phase gap part of a smaller total gap", () => {
    const them = card({ name: "Sam", averageMs: 13500, phases: { Cross: 2200, F2L: 6000, OLL: 2400, PLL: 2900 } });
    expect(compareCards(card(), them).headline).toBe("Sam is 0.50s faster on average — the biggest gap is F2L, 1.00s.");
  });

  it("says so when the phases can't be compared", () => {
    const r = compareCards(card({ phases: {} }), card({ name: "B", averageMs: 14050 }));
    expect(r.headline).toMatch(/^Dead even/);
    expect(r.steal.join(" ")).toMatch(/needs smart-cube solves/);
  });
});
