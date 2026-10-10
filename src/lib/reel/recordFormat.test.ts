import { describe, expect, it } from "vitest";
import { pickRecordFormat } from "./recordFormat";

describe("pickRecordFormat", () => {
  it("prefers H.264 MP4 over WebM when both can be recorded, so WhatsApp can open the file", () => {
    const f = pickRecordFormat(() => true);
    expect(f?.ext).toBe("mp4");
    expect(f?.mime).toContain("avc1");
    expect(f?.shareable).toBe(true);
  });

  it("falls back to WebM, marked as not shareable, when MP4 is unavailable", () => {
    const f = pickRecordFormat((m) => m.startsWith("video/webm"));
    expect(f).toMatchObject({ ext: "webm", shareable: false });
    expect(f?.mime).toBe("video/webm;codecs=vp9,opus");
  });

  it("does not call a bare MP4 shareable: without an H.264 codec it can be VP9 in an MP4 wrapper, which WhatsApp rejects", () => {
    expect(pickRecordFormat((m) => m === "video/mp4")).toMatchObject({ ext: "mp4", shareable: false });
  });

  it("is null when nothing can be recorded", () => {
    expect(pickRecordFormat(() => false)).toBeNull();
  });
});
