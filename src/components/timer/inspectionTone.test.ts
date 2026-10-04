import { describe, expect, it } from "vitest";
import { inspectionAnnouncement, inspectionPulsing, inspectionTone } from "./inspectionTone";

// remaining = 15000 - elapsed
const at = (elapsedMs: number) => 15_000 - elapsedMs;

describe("inspectionTone", () => {
  it("is calm before 8s, amber from 8s, red from 12s — the ring's thresholds", () => {
    expect(inspectionTone(at(0), "none")).toBe("calm");
    expect(inspectionTone(at(7_999), "none")).toBe("calm");
    expect(inspectionTone(at(8_000), "none")).toBe("warn");
    expect(inspectionTone(at(11_999), "none")).toBe("warn");
    expect(inspectionTone(at(12_000), "none")).toBe("danger");
    expect(inspectionTone(at(15_000), "none")).toBe("danger");
  });

  it("goes to the penalty tone only once the +2 or DNF applies", () => {
    expect(inspectionTone(0, "plus2")).toBe("penalty");
    expect(inspectionTone(0, "dnf")).toBe("penalty");
  });
});

describe("inspectionPulsing", () => {
  it("pulses briefly after 8s and 12s, and nowhere else", () => {
    expect(inspectionPulsing(at(7_900), "none")).toBe(false);
    expect(inspectionPulsing(at(8_000), "none")).toBe(true);
    expect(inspectionPulsing(at(8_599), "none")).toBe(true);
    expect(inspectionPulsing(at(8_600), "none")).toBe(false);
    expect(inspectionPulsing(at(12_100), "none")).toBe(true);
    expect(inspectionPulsing(at(13_000), "none")).toBe(false);
    expect(inspectionPulsing(0, "plus2")).toBe(false);
  });
});

describe("inspectionAnnouncement", () => {
  it("only says something at the marks", () => {
    expect(inspectionAnnouncement("calm", "none")).toBe("");
    expect(inspectionAnnouncement("warn", "none")).toMatch(/8 seconds/);
    expect(inspectionAnnouncement("danger", "none")).toMatch(/12 seconds/);
    expect(inspectionAnnouncement("penalty", "plus2")).toMatch(/plus 2/);
    expect(inspectionAnnouncement("penalty", "dnf")).toMatch(/DNF/);
  });
});
