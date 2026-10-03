import { describe, expect, it } from "vitest";
import { formatTime, parseManualTime, parseTimeInput } from "./time";

describe("formatTime", () => {
  it("formats sub-minute times without a leading zero", () => {
    expect(formatTime(12340)).toBe("12.34");
  });
  it("formats minute+ times as M:SS.xx", () => {
    expect(formatTime(62340)).toBe("1:02.34");
  });
});

describe("parseTimeInput", () => {
  it("parses plain seconds", () => {
    expect(parseTimeInput("12.34")).toBe(12340);
    expect(parseTimeInput("83")).toBe(83000);
  });
  it("parses mm:ss.xx", () => {
    expect(parseTimeInput("1:02.34")).toBe(62340);
    expect(parseTimeInput("2:00")).toBe(120000);
  });
  it("rejects invalid input", () => {
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("1:72")).toBeNull();
  });
});

describe("parseManualTime", () => {
  const ms = (input: string) => {
    const r = parseManualTime(input);
    return r.ok ? r.ms : null;
  };

  it("reads digits alone csTimer-style, the last two as hundredths", () => {
    expect(ms("1234")).toBe(12340);
    expect(ms("934")).toBe(9340);
    expect(ms("10234")).toBe(62340);
    expect(ms("83")).toBe(830);
    expect(ms("5")).toBe(50);
    expect(ms("9999")).toBe(99990);
    expect(ms("100000")).toBe(600000);
  });

  it("rejects a digits-only seconds field over 59 once there are minutes", () => {
    expect(ms("16000")).toBeNull();
  });

  it("still accepts decimal and colon forms", () => {
    expect(ms("12.34")).toBe(12340);
    expect(ms("1:02.34")).toBe(62340);
    expect(ms(" 9.5 ")).toBe(9500);
    expect(ms("12,34")).toBe(12340);
  });

  it("rejects zero and anything non-positive with a message", () => {
    for (const input of ["0", "000", "0.00", "0:00.00", "-5", "-1.23"]) {
      const r = parseManualTime(input);
      expect(r.ok, input).toBe(false);
    }
    for (const input of ["0.00", "-5"]) {
      const r = parseManualTime(input);
      expect(!r.ok && r.error).toMatch(/more than zero/);
    }
  });

  it("rejects empty and non-times", () => {
    expect(parseManualTime("")).toEqual({ ok: false, error: "Enter a time" });
    expect(ms("abc")).toBeNull();
    expect(ms("1:72")).toBeNull();
    expect(ms("12.34.5")).toBeNull();
  });
});
