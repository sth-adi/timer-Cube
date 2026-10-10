/**
 * Which video format the reel is recorded in. WhatsApp, iMessage, Instagram and most phone gallery apps only open MP4 (H.264 + AAC);
 * a WebM file saves fine but they reject it. So H.264 MP4 comes first wherever the browser can record it, and WebM is only the fallback.
 */
export const RECORD_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export interface RecordFormat {
  mime: string;
  ext: "mp4" | "webm";
  /** True when the file will open in WhatsApp and the usual share targets. */
  shareable: boolean;
}

/** The best format `isSupported` accepts, or null when none is. */
export function pickRecordFormat(isSupported: (mime: string) => boolean): RecordFormat | null {
  const mime = RECORD_MIME_CANDIDATES.find((m) => isSupported(m));
  if (!mime) return null;
  const mp4 = mime.startsWith("video/mp4");
  // A bare "video/mp4" can mean VP9 in an MP4 wrapper (some Chromium builds without H.264), which WhatsApp rejects too: only an H.264 (avc1) recording counts.
  return { mime, ext: mp4 ? "mp4" : "webm", shareable: mime.includes("avc1") };
}
