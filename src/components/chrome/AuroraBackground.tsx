/**
 * Two slowly drifting, theme-tinted blobs behind the whole app, plus a
 * vignette so they read as depth rather than haze. Pure CSS (see
 * globals.css) — no canvas, no per-frame JS, and it flattens automatically
 * under prefers-reduced-motion.
 */
export function AuroraBackground() {
  return (
    <div className="aurora-layer" aria-hidden="true">
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-vignette" />
    </div>
  );
}
