import { describe, expect, it } from "vitest";
import { applyTurn } from "@/lib/cube-engine/stickerTurns";
import { CONNECT_ALG, READY_AFTER_MS, READY_WAIT_BATTERY_MS, SOLVED_FACELETS, batterySegments, connectLine, invertAlg, loopFrames, readyLine, scriptFrames } from "./connectScript";

describe("invertAlg", () => {
  it("reverses the order and flips each turn", () => {
    expect(invertAlg(["R", "U", "R'", "U'"])).toEqual(["U", "R", "U'", "R'"]);
    expect(invertAlg(["F2", "B'"])).toEqual(["B", "F2"]);
  });
});

describe("scriptFrames", () => {
  it("plays the alg so it lands exactly on the end state", () => {
    const frames = scriptFrames(SOLVED_FACELETS);
    expect(frames).toHaveLength(CONNECT_ALG.length + 1);
    expect(frames[frames.length - 1]).toBe(SOLVED_FACELETS);
    expect(frames[0]).not.toBe(SOLVED_FACELETS);
  });
  it("each frame is one turn after the last", () => {
    const frames = scriptFrames(SOLVED_FACELETS);
    CONNECT_ALG.forEach((t, i) => expect(applyTurn(frames[i], t)).toBe(frames[i + 1]));
  });
  it("lands on a non-solved end state too", () => {
    const end = applyTurn(applyTurn(SOLVED_FACELETS, "F"), "L'");
    const frames = scriptFrames(end);
    expect(frames[frames.length - 1]).toBe(end);
  });
});

describe("loopFrames", () => {
  it("closes on solved so the loop has no jump", () => {
    const frames = loopFrames();
    expect(frames).toHaveLength(CONNECT_ALG.length * 6 + 1);
    expect(frames[0]).toBe(SOLVED_FACELETS);
    expect(frames[frames.length - 1]).toBe(SOLVED_FACELETS);
    expect(frames.slice(1, -1).includes(SOLVED_FACELETS)).toBe(false);
  });
});

describe("status lines", () => {
  it("walks Connecting then Reading cube while the link comes up", () => {
    expect(connectLine(0)).toBe("Connecting");
    expect(connectLine(1)).toBe("Connecting");
    expect(connectLine(2)).toBe("Reading cube");
  });
  it("says Ready only after the turns have played, waiting a little for the battery", () => {
    expect(readyLine(0, false)).toBe("Reading cube");
    expect(readyLine(READY_AFTER_MS, false)).toBe("Ready");
    expect(readyLine(READY_AFTER_MS, true)).toBe("Reading cube");
    expect(readyLine(READY_WAIT_BATTERY_MS, true)).toBe("Ready");
  });
});

describe("batterySegments", () => {
  it("fills whole segments", () => {
    expect(batterySegments(100)).toBe(5);
    expect(batterySegments(50)).toBe(3);
    expect(batterySegments(20)).toBe(1);
    expect(batterySegments(3)).toBe(1);
    expect(batterySegments(0)).toBe(0);
  });
  it("is null when unknown", () => {
    expect(batterySegments(null)).toBeNull();
    expect(batterySegments(Number.NaN)).toBeNull();
  });
});
