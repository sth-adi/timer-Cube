"use client";

import { useSyncExternalStore } from "react";
import "@/styles/twinoverlay.css";

const KEY = "cube-timer:twin-face-letters";

let current: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (current === null) {
    try {
      current = localStorage.getItem(KEY) === "1";
    } catch {
      current = false;
    }
  }
  return current;
}

function write(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the choice just doesn't outlive this page.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the twins draw U/F/R… on their centre stickers, remembered across visits. Off until the cuber asks for it. */
export function useFaceLetters(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, write];
}

/**
 * Where each face's letter plane goes, as the cube's own face transforms (a plane just proud of the centre sticker).
 * FaceLetters turns each 180 degrees in its plane: the twin's home grip is yellow up (a z2), which has every letter
 * upside down otherwise, so at the grip the cube is held in they read upright.
 */
const PLANE: Record<string, (d: number) => string> = {
  F: (d) => `translateZ(${d}px)`,
  B: (d) => `rotateY(180deg) translateZ(${d}px)`,
  R: (d) => `rotateY(90deg) translateZ(${d}px)`,
  L: (d) => `rotateY(-90deg) translateZ(${d}px)`,
  U: (d) => `rotateX(90deg) translateZ(${d}px)`,
  D: (d) => `rotateX(-90deg) translateZ(${d}px)`,
};
/** The centre stickers are white, red, green, yellow, orange and blue: pick the ink that reads on each (the sticker colours are fixed, so these are too). */
const INK: Record<string, "dark" | "light"> = { U: "dark", D: "dark", L: "dark", R: "light", F: "light", B: "light" };

/**
 * The six face letters, one flat plane over each centre sticker. Drop it inside the twin's tilted box, next to
 * the cube, which is `size` px square and centred in that box; backfaces are hidden, so only the faces turned
 * toward you show a letter. The letters name the cube's own faces (the white centre is always U).
 */
export function FaceLetters({ size }: { size: number }) {
  const s = size / 3;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
      {Object.keys(PLANE).map((face) => (
        <span
          key={face}
          className="tw-face-letter font-mono"
          data-ink={INK[face]}
          style={{ left: s, top: s, width: s, height: s, fontSize: s * 0.52, transform: `${PLANE[face](size / 2 + 0.8)} rotate(180deg)` }}
        >
          {face}
        </span>
      ))}
    </div>
  );
}

/** The tiny on/off control for the letters. */
export function FaceLettersToggle() {
  const [on, set] = useFaceLetters();
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      aria-pressed={on}
      title="Show U F R… on the twin's centre stickers"
      className={
        "relative flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold before:absolute before:-inset-2 before:content-[''] " +
        (on ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground")
      }
    >
      UFR
    </button>
  );
}
