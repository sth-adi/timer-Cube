/** True when screen motion should be skipped: the OS asks for reduced motion, or the FX level is "off". */
export function motionIsOff(): boolean {
  if (typeof document === "undefined") return true;
  if (document.documentElement.dataset.fxLevel === "off") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
