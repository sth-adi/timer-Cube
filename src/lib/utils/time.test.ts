import { describe, expect, it } from "vitest";
import { formatTime, parseTimeInput } from "./time";

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
