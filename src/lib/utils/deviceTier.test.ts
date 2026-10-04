import { describe, expect, it } from "vitest";
import { defaultFxLevelFor, firstRunFxLevel, hasSavedFxChoice, isLowPowerDevice } from "./deviceTier";

describe("isLowPowerDevice", () => {
  it("never demotes a fine-pointer device, however weak it reports", () => {
    expect(isLowPowerDevice({ coarsePointer: false, cores: 2, memoryGb: 2 })).toBe(false);
  });

  it("flags a touch device with few cores or little memory", () => {
    expect(isLowPowerDevice({ coarsePointer: true, cores: 4 })).toBe(true);
    expect(isLowPowerDevice({ coarsePointer: true, cores: 8, memoryGb: 4 })).toBe(true);
    expect(isLowPowerDevice({ coarsePointer: true, cores: 2, memoryGb: 8 })).toBe(true);
  });

  it("keeps a capable touch device on the full look", () => {
    expect(isLowPowerDevice({ coarsePointer: true, cores: 8, memoryGb: 8 })).toBe(false);
    expect(isLowPowerDevice({ coarsePointer: true, cores: 6 })).toBe(false);
  });

  it("treats a signal the browser hides as unknown, not weak", () => {
    expect(isLowPowerDevice({ coarsePointer: true })).toBe(false);
    expect(isLowPowerDevice({ coarsePointer: true, cores: 0, memoryGb: 0 })).toBe(false);
  });
});

describe("defaultFxLevelFor", () => {
  it("picks spicy for low-power devices and insane otherwise", () => {
    expect(defaultFxLevelFor({ coarsePointer: true, cores: 4 })).toBe("spicy");
    expect(defaultFxLevelFor({ coarsePointer: false, cores: 16 })).toBe("insane");
  });
});

describe("hasSavedFxChoice", () => {
  it("is true only when the persisted state names a level", () => {
    expect(hasSavedFxChoice(JSON.stringify({ state: { fxLevel: "off" }, version: 2 }))).toBe(true);
    expect(hasSavedFxChoice(JSON.stringify({ state: { theme: "mint" }, version: 2 }))).toBe(false);
    expect(hasSavedFxChoice(null)).toBe(false);
    expect(hasSavedFxChoice("")).toBe(false);
    expect(hasSavedFxChoice("{not json")).toBe(false);
    expect(hasSavedFxChoice("null")).toBe(false);
  });
});

describe("firstRunFxLevel", () => {
  const weak = { coarsePointer: true, cores: 4 };
  const strong = { coarsePointer: false, cores: 12, memoryGb: 8 };

  it("lowers the level on a fresh low-power install", () => {
    expect(firstRunFxLevel({ alreadyDecided: false, rawSettings: null, signals: weak })).toBe("spicy");
  });

  it("leaves a fresh install on a capable device alone", () => {
    expect(firstRunFxLevel({ alreadyDecided: false, rawSettings: null, signals: strong })).toBeNull();
  });

  it("never touches a saved choice, even one equal to the old default", () => {
    const saved = JSON.stringify({ state: { fxLevel: "insane" }, version: 2 });
    expect(firstRunFxLevel({ alreadyDecided: false, rawSettings: saved, signals: weak })).toBeNull();
  });

  it("decides only once", () => {
    expect(firstRunFxLevel({ alreadyDecided: true, rawSettings: null, signals: weak })).toBeNull();
  });

  it("still applies when settings exist but never named a level", () => {
    const raw = JSON.stringify({ state: { theme: "mint" }, version: 2 });
    expect(firstRunFxLevel({ alreadyDecided: false, rawSettings: raw, signals: weak })).toBe("spicy");
  });
});
