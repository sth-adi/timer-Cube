import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relativeTime";

const NOW = 1_700_000_000_000;
const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW);

describe("formatRelativeTime", () => {
  it("says just now under a minute, and for clock skew into the future", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(59_999)).toBe("just now");
    expect(ago(-5_000)).toBe("just now");
  });
  it("uses minutes up to an hour", () => {
    expect(ago(60_000)).toBe("1 min ago");
    expect(ago(2 * 60_000 + 30_000)).toBe("2 min ago");
    expect(ago(59 * 60_000)).toBe("59 min ago");
  });
  it("uses hours up to a day", () => {
    expect(ago(60 * 60_000)).toBe("1 h ago");
    expect(ago(3 * 3_600_000 + 1)).toBe("3 h ago");
    expect(ago(23 * 3_600_000)).toBe("23 h ago");
  });
  it("uses days beyond that", () => {
    expect(ago(24 * 3_600_000)).toBe("1 d ago");
    expect(ago(2 * 86_400_000 + 5)).toBe("2 d ago");
  });
  it("treats a non-finite difference as just now", () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("just now");
  });
});
