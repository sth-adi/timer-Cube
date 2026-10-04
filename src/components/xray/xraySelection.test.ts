import { describe, expect, it } from "vitest";
import { pickXraySolve, xrayHref } from "./xraySelection";

const solves = [{ id: "new" }, { id: "mid" }, { id: "old" }];

describe("xrayHref", () => {
  it("names the solve, escaped", () => {
    expect(xrayHref("abc")).toBe("/xray?solve=abc");
    expect(xrayHref("a b&c")).toBe("/xray?solve=a%20b%26c");
  });
  it("is the bare page without an id", () => {
    expect(xrayHref()).toBe("/xray");
    expect(xrayHref("")).toBe("/xray");
  });
});

describe("pickXraySolve", () => {
  it("opens the newest with no link", () => {
    expect(pickXraySolve(solves, null, null)).toEqual({ selected: solves[0], linkMissing: false });
  });
  it("opens the linked solve, even an older one", () => {
    expect(pickXraySolve(solves, null, "old")).toEqual({ selected: solves[2], linkMissing: false });
  });
  it("a tap in the strip beats the link", () => {
    expect(pickXraySolve(solves, "mid", "old").selected).toBe(solves[1]);
  });
  it("falls back to the newest and says so when the link names nothing here", () => {
    expect(pickXraySolve(solves, null, "gone")).toEqual({ selected: solves[0], linkMissing: true });
  });
  it("stops saying so once another solve is picked", () => {
    expect(pickXraySolve(solves, "mid", "gone").linkMissing).toBe(false);
  });
  it("says nothing while there are no candidates yet", () => {
    expect(pickXraySolve([], null, "old")).toEqual({ selected: null, linkMissing: false });
  });
});
