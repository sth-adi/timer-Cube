import { describe, expect, it } from "vitest";
import { parseUsage, rankTools, toolKey, withVisit } from "./toolUsage";

describe("tool usage", () => {
  it("keys a route by its first segment, and ignores the home page", () => {
    expect(toolKey("/luck")).toBe("/luck");
    expect(toolKey("/solve/abc")).toBe("/solve");
    expect(toolKey("/")).toBeNull();
  });

  it("counts visits and survives bad stored data", () => {
    let u = parseUsage("not json");
    expect(u).toEqual({});
    u = withVisit(u, "/luck", 1);
    u = withVisit(u, "/luck", 2);
    expect(parseUsage(JSON.stringify(u))).toEqual({ "/luck": { count: 2, last: 2 } });
    expect(parseUsage(JSON.stringify({ "/x": { count: "3" } }))).toEqual({});
  });

  it("ranks opened tools by count, then recency, and lists the rest", () => {
    const tools = [{ href: "/a" }, { href: "/b" }, { href: "/c" }, { href: "/d" }];
    const usage = { "/b": { count: 3, last: 1 }, "/c": { count: 1, last: 5 }, "/d": { count: 1, last: 9 } };
    const { used, unused } = rankTools(tools, usage);
    expect(used.map((t) => t.href)).toEqual(["/b", "/d", "/c"]);
    expect(unused.map((t) => t.href)).toEqual(["/a"]);
  });
});
