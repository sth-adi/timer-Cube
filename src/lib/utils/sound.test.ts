import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { soundEnabled: true };
vi.mock("@/lib/store/settingsStore", () => ({ useSettingsStore: { getState: () => settings } }));

interface Param {
  calls: [string, number, number?][];
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
}
function param(): Param {
  const calls: Param["calls"] = [];
  return {
    calls,
    setValueAtTime: (v, t) => calls.push(["set", v, t]),
    linearRampToValueAtTime: (v, t) => calls.push(["lin", v, t]),
    exponentialRampToValueAtTime: (v, t) => calls.push(["exp", v, t]),
  };
}

interface Voice {
  freq: number;
  gain: Param;
  start: number | null;
  stop: number | null;
}

let voices: Voice[];
let instances: FakeAudioContext[];
let initialState: string;
let resumeImpl: () => Promise<void>;

class FakeAudioContext {
  state = initialState;
  currentTime = 5;
  destination = {};
  resume = vi.fn(() => resumeImpl());
  constructor() {
    instances.push(this);
  }
  createOscillator() {
    const v: Voice = { freq: 0, gain: param(), start: null, stop: null };
    voices.push(v);
    return {
      type: "",
      frequency: {
        set value(f: number) {
          v.freq = f;
        },
      },
      connect: () => {},
      start: (t: number) => {
        v.start = t;
      },
      stop: (t: number) => {
        v.stop = t;
      },
    };
  }
  createGain() {
    const v = voices[voices.length - 1];
    return { gain: v.gain, connect: () => {} };
  }
}

async function load() {
  vi.resetModules();
  return import("./sound");
}

beforeEach(() => {
  voices = [];
  instances = [];
  initialState = "running";
  resumeImpl = () => Promise.resolve();
  settings.soundEnabled = true;
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
});
afterEach(() => vi.unstubAllGlobals());

const peak = (v: Voice) => Math.max(...v.gain.calls.map((c) => c[1]));
const length = (v: Voice) => (v.stop ?? 0) - (v.start ?? 0);

describe("resuming a suspended context", () => {
  it.each(["suspended", "interrupted"])("resumes a %s context before every cue", async (state) => {
    initialState = state;
    const s = await load();
    s.playInspectionBeep(8);
    s.playInspectionBeep(12);
    s.playSolveChime();
    s.playPBChime();
    s.playPaceTone("on");
    expect(instances).toHaveLength(1);
    expect(instances[0].resume).toHaveBeenCalledTimes(5);
    expect(voices.length).toBeGreaterThan(0);
  });

  it("leaves a running context alone", async () => {
    const s = await load();
    s.playInspectionBeep();
    expect(instances[0].resume).not.toHaveBeenCalled();
  });

  it("swallows a resume that rejects or throws", async () => {
    initialState = "suspended";
    resumeImpl = () => Promise.reject(new Error("NotAllowedError"));
    const s = await load();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    expect(() => s.playInspectionBeep()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    resumeImpl = () => {
      throw new Error("sync");
    };
    expect(() => s.playInspectionBeep()).not.toThrow();
  });

  it("does nothing without Web Audio", async () => {
    vi.stubGlobal("window", {});
    const s = await load();
    expect(() => s.playInspectionBeep()).not.toThrow();
    expect(() => s.primeAudio()).not.toThrow();
    expect(voices).toHaveLength(0);
  });
});

describe("primeAudio", () => {
  it("creates the context and resumes it", async () => {
    initialState = "suspended";
    const s = await load();
    s.primeAudio();
    expect(instances).toHaveLength(1);
    expect(instances[0].resume).toHaveBeenCalledTimes(1);
    expect(voices).toHaveLength(0);
  });

  it("reuses one context", async () => {
    const s = await load();
    s.primeAudio();
    s.primeAudio();
    s.playInspectionBeep();
    expect(instances).toHaveLength(1);
  });

  it("works even with the solve sounds off (the pacer still needs the context)", async () => {
    settings.soundEnabled = false;
    initialState = "suspended";
    const s = await load();
    s.primeAudio();
    expect(instances[0].resume).toHaveBeenCalledTimes(1);
  });
});

describe("inspection cues", () => {
  it("is a ~110 ms beep at about 0.12 gain with a soft attack and release", async () => {
    const s = await load();
    s.playInspectionBeep(8);
    expect(voices).toHaveLength(1);
    const v = voices[0];
    expect(peak(v)).toBeCloseTo(0.12, 5);
    expect(peak(v)).toBeLessThanOrEqual(s.MAX_CUE_GAIN);
    expect(length(v)).toBeGreaterThanOrEqual(0.11);
    expect(length(v)).toBeLessThan(0.15);
    // Starts and ends silent, so there is no click.
    expect(v.gain.calls[0]).toEqual(["set", 0, 5]);
    const last = v.gain.calls[v.gain.calls.length - 1];
    expect(last[1]).toBeLessThan(0.01);
    // Attack takes a few ms, not zero.
    const attack = v.gain.calls.find((c) => c[0] === "lin" && c[1] > 0)!;
    expect((attack[2] ?? 0) - 5).toBeGreaterThan(0.005);
  });

  it("makes the 12 s cue a distinct, higher two-tone", async () => {
    const s = await load();
    s.playInspectionBeep(8);
    const eight = voices.map((v) => v.freq);
    voices = [];
    s.playInspectionBeep(12);
    expect(eight).toHaveLength(1);
    expect(voices).toHaveLength(2);
    expect(voices[0].freq).toBeGreaterThan(eight[0]);
    expect(voices[1].freq).toBeGreaterThan(voices[0].freq);
    for (const v of voices) {
      expect(peak(v)).toBeLessThanOrEqual(s.MAX_CUE_GAIN);
      expect(length(v)).toBeGreaterThanOrEqual(0.11);
    }
    // Two separate notes, not an overlapping chord.
    expect(voices[1].start!).toBeGreaterThanOrEqual(voices[0].stop!);
  });

  it("defaults to the 8 s cue", async () => {
    const s = await load();
    s.playInspectionBeep();
    expect(voices).toHaveLength(1);
  });
});

describe("gain cap", () => {
  it("never plays louder than the cap", async () => {
    const s = await load();
    s.playInspectionBeep(8);
    s.playInspectionBeep(12);
    s.playSolveChime();
    s.playPBChime();
    for (const v of ["ahead", "on", "behind"] as const) s.playPaceTone(v);
    for (const v of voices) expect(peak(v)).toBeLessThanOrEqual(s.MAX_CUE_GAIN);
  });
});

describe("sound disabled", () => {
  it("is a no-op for the inspection beeps and chimes", async () => {
    settings.soundEnabled = false;
    initialState = "suspended";
    const s = await load();
    s.playInspectionBeep(8);
    s.playInspectionBeep(12);
    s.playSolveChime();
    s.playPBChime();
    expect(instances).toHaveLength(0);
    expect(voices).toHaveLength(0);
  });
});
