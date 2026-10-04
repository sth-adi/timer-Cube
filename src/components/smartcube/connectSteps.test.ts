import { describe, expect, it } from "vitest";
import { CONNECT_STEPS, GYRO_STATUS_LABEL, HOLD_LINE, connectStep, gyroStatus, reconnectLine } from "./connectSteps";

describe("connectStep", () => {
  it("is the pick step before any message and while the chooser is open", () => {
    expect(connectStep(null)).toBe(0);
    expect(connectStep("")).toBe(0);
    expect(connectStep("Select your cube…")).toBe(0);
  });

  it("is the address step while the address is being found or asked for", () => {
    expect(connectStep("Reading advertisements…")).toBe(1);
    expect(connectStep("Waiting for the cube's address…")).toBe(1);
    expect(connectStep("Testing address (3/12)…")).toBe(1);
  });

  it("is the connect step for everything else the library reports", () => {
    expect(connectStep("Connecting…")).toBe(2);
    expect(connectStep("Verifying connection…")).toBe(2);
    expect(connectStep("Something new")).toBe(2);
  });

  it("only ever indexes a real step label", () => {
    for (const s of [null, "Select your cube…", "Reading advertisements…", "Connecting…"]) {
      expect(CONNECT_STEPS[connectStep(s)]).toBeDefined();
    }
  });
});

describe("reconnectLine", () => {
  it("reads as a drop, distinct from the first-connect wording", () => {
    expect(reconnectLine("GAN i3", true)).toBe("Lost the link to GAN i3 — getting it back…");
    expect(reconnectLine("GAN i3", true)).not.toMatch(/^Connecting/);
    expect(reconnectLine(null, false)).toBe("Your cube went quiet — will try again shortly");
  });
});

describe("gyroStatus", () => {
  it("reads none until the cube has streamed orientation, whatever is saved", () => {
    expect(gyroStatus(false, "GAN", { GAN: {} })).toBe("none");
  });
  it("is calibrated only when this protocol has a saved calibration", () => {
    expect(gyroStatus(true, "GAN", { GAN: {} })).toBe("calibrated");
    expect(gyroStatus(true, "MoYu", { GAN: {} })).toBe("uncalibrated");
    expect(gyroStatus(true, null, { GAN: {} })).toBe("uncalibrated");
  });
  it("has a label for each status", () => {
    expect(GYRO_STATUS_LABEL.calibrated).toMatch(/^calibrated/i);
    expect(GYRO_STATUS_LABEL.uncalibrated).toMatch(/not calibrated/i);
    expect(GYRO_STATUS_LABEL.none).toMatch(/no gyro/i);
  });
});

describe("HOLD_LINE", () => {
  it("names the home grip", () => {
    expect(HOLD_LINE).toMatch(/yellow on top/);
    expect(HOLD_LINE).toMatch(/green facing you/);
  });
});
