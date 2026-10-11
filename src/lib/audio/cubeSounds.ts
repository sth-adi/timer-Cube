import {
  START_BEEP,
  STOP_BEEP,
  generateTurnParams,
  seededRng,
  type Rng,
  type TurnParams,
} from "./cubeSoundParams";

/** Where optional recorded samples live (public/sounds/cube/). */
export const CUBE_SAMPLE_BASE = "/sounds/cube";
export const MAX_TURN_SAMPLES = 16;

export interface PlayTurnArgs {
  token: string;
  /** Turns per second around this turn (louder and sharper when higher). */
  speed: number;
  /** How long the layer takes to turn; the snap lands at the end of it. */
  durationMs: number;
  /** AudioContext time at which the turn starts; defaults to now. */
  atTime?: number;
}

export interface CubeSounds {
  playTurn: (args: PlayTurnArgs) => void;
  playStart: (atTime?: number) => void;
  playStop: (atTime?: number) => void;
  /** 0..1, applied after the limiter. */
  setVolume: (v: number) => void;
  /** Look for recordings in public/sounds/cube/; resolves true if any turn sample loaded. */
  loadSamples: (baseUrl?: string) => Promise<boolean>;
  dispose: () => void;
}

export interface CubeSoundsOptions {
  /** Defaults to ctx.destination. */
  destination?: AudioNode;
  /** Fixed seed for reproducible renders; defaults to a time-based one. */
  seed?: number;
  volume?: number;
}

/** Everything a turn schedules starts this far ahead of "now" at the earliest. */
const LOOKAHEAD_S = 0.004;
/** Band-passed noise carries far less energy than a sine of the same gain, so the knocks are scaled up to sit where the sine rings did. */
const KNOCK_NOISE_GAIN = 2.6;
const NOISE_SECONDS = 2;

function noiseBuffer(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
  return buf;
}

/** tanh soft clip scaled so the output never exceeds `ceiling`. */
function softClipCurve(ceiling: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.2) * ceiling;
  }
  return c;
}

export function createCubeSounds(ctx: BaseAudioContext, opts: CubeSoundsOptions = {}): CubeSounds {
  const seed = opts.seed ?? ((Date.now() ^ 0x5bd1e995) >>> 0);
  const rng = seededRng(seed);
  const noise = noiseBuffer(ctx, seededRng(seed ^ 0xa5a5a5a5));

  // voices -> bus -> compressor -> soft clip -> volume -> out
  const bus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 10;
  comp.attack.value = 0.001;
  comp.release.value = 0.08;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(0.85);
  const master = ctx.createGain();
  master.gain.value = clamp01(opts.volume ?? 0.8);
  bus.connect(comp);
  comp.connect(clip);
  clip.connect(master);
  master.connect(opts.destination ?? ctx.destination);

  const live = new Set<AudioScheduledSourceNode>();
  let disposed = false;
  let turnSamples: AudioBuffer[] = [];
  let startSample: AudioBuffer | null = null;
  let stopSample: AudioBuffer | null = null;
  let lastSampleIdx = -1;

  const track = (src: AudioScheduledSourceNode, tail?: AudioNode) => {
    live.add(src);
    src.onended = () => {
      live.delete(src);
      try {
        src.disconnect();
        tail?.disconnect();
      } catch {
        // Already disconnected.
      }
    };
  };

  const hasPanner = typeof ctx.createStereoPanner === "function";
  /** Input node of a per-voice stage that pans and feeds the bus. */
  const voiceOut = (pan: number): AudioNode => {
    if (!hasPanner) return bus;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(bus);
    return p;
  };

  /** A band-passed slice of the shared noise with an exponential decay. */
  const noiseBurst = (out: AudioNode, t: number, durS: number, hz: number, q: number, gain: number) => {
    if (gain <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(durS, 0.001));
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    const off = rng() * (NOISE_SECONDS - 0.5);
    src.start(t, off);
    src.stop(t + durS + 0.01);
    track(src, g);
  };

  /**
   * A short damped "knock": noise pushed through a low-Q band-pass, so it has a colour (a plastic "tok") but no musical
   * pitch. Pure sine rings here sounded like a struck xylophone bar; real cube clacks are broadband bursts with a
   * wide, quickly dying resonance, which is what this makes. `decayS` is the time constant of the decay.
   */
  const ring = (out: AudioNode, t: number, hz: number, decayS: number, gain: number, attackS = 0.0004) => {
    if (gain <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz;
    bp.Q.value = hz < 400 ? 0.9 : 1.6;
    const g = ctx.createGain();
    const end = t + decayS * 7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * KNOCK_NOISE_GAIN, t + attackS);
    g.gain.setTargetAtTime(0, t + attackS, decayS);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t, rng() * (NOISE_SECONDS - 0.5));
    src.stop(end);
    track(src, g);
  };

  const scrape = (out: AudioNode, t: number, p: NonNullable<TurnParams["scrape"]>) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = p.centerHz;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    // A ratchet: gain flickers tick to tick under a swell that fades out near the snap.
    g.gain.setValueAtTime(0, t);
    let x = 0;
    const end = t + p.durS;
    while (t + x < end) {
      const phase = x / p.durS;
      const swell = Math.sin(Math.PI * Math.min(1, phase)) ** 0.7;
      const v = p.gain * swell * (0.35 + 0.65 * rng());
      g.gain.setValueAtTime(v, t + x);
      x += p.tickS * (0.8 + 0.4 * rng());
    }
    g.gain.setValueAtTime(0, end);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t, rng() * (NOISE_SECONDS - 1));
    src.stop(end + 0.01);
    track(src, g);
  };

  const whoosh = (out: AudioNode, t: number, p: NonNullable<TurnParams["whoosh"]>) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "bandpass";
    lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(p.fromHz, t);
    lp.frequency.exponentialRampToValueAtTime(p.toHz, t + p.durS);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.gain, t + p.durS * 0.45);
    g.gain.linearRampToValueAtTime(0, t + p.durS);
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    src.start(t, rng() * (NOISE_SECONDS - 1));
    src.stop(t + p.durS + 0.01);
    track(src, g);
  };

  const playSample = (buf: AudioBuffer, t: number, rate: number, gain: number, pan: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const out = voiceOut(pan);
    src.connect(g);
    g.connect(out);
    src.start(t);
    track(src, g);
  };

  const now = () => ctx.currentTime + LOOKAHEAD_S;

  const playTurn = ({ token, speed, durationMs, atTime }: PlayTurnArgs) => {
    if (disposed) return;
    const t0 = Math.max(atTime ?? 0, now());
    const p = generateTurnParams(token, speed, durationMs, rng);
    const tSnap = t0 + p.snapDelayS;
    const out = voiceOut(p.pan);

    // Grab tick as the layer lets go.
    noiseBurst(out, t0, p.grab.durS, p.grab.centerHz, 0.8, p.grab.gain);
    if (p.scrape) scrape(out, t0 + p.scrape.startS, p.scrape);
    if (p.whoosh) whoosh(out, t0, p.whoosh);

    if (turnSamples.length > 0 && p.layer !== "rotation") {
      let i = Math.floor(rng() * turnSamples.length);
      if (turnSamples.length > 1 && i === lastSampleIdx) i = (i + 1) % turnSamples.length;
      lastSampleIdx = i;
      playSample(turnSamples[i]!, tSnap, p.sample.rate, p.sample.gain, p.pan);
      return;
    }

    // The snap: transient, ringing plastic, body thud, then the settling tick.
    noiseBurst(out, tSnap, p.click.durS, p.click.centerHz, p.click.q, p.click.gain);
    for (const k of p.knocks) ring(out, tSnap, k.freq, k.decayS, k.gain);
    ring(out, tSnap, p.thud.freq, p.thud.decayS, p.thud.gain, 0.001);
    ring(out, tSnap + p.settle.delayS, p.settle.freq, p.settle.decayS, p.settle.gain);
  };

  const beeps = (cfg: { freq: number; gain: number; pulses: readonly (readonly [number, number])[] }, t: number) => {
    const out = bus;
    for (const [offset, dur] of cfg.pulses) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = cfg.freq;
      const g = ctx.createGain();
      const a = 0.008;
      const r = Math.min(0.03, dur * 0.4);
      const s = t + offset;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(cfg.gain, s + a);
      g.gain.setValueAtTime(cfg.gain, s + dur - r);
      g.gain.linearRampToValueAtTime(0, s + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(s);
      osc.stop(s + dur + 0.01);
      track(osc, g);
    }
  };

  return {
    playTurn,
    playStart: (atTime) => {
      if (disposed) return;
      const t = Math.max(atTime ?? 0, now());
      if (startSample) playSample(startSample, t, 1, 0.8, 0);
      else beeps(START_BEEP, t);
    },
    playStop: (atTime) => {
      if (disposed) return;
      const t = Math.max(atTime ?? 0, now());
      if (stopSample) playSample(stopSample, t, 1, 0.8, 0);
      else beeps(STOP_BEEP, t);
    },
    setVolume: (v) => {
      master.gain.value = clamp01(v);
    },
    loadSamples: async (baseUrl = CUBE_SAMPLE_BASE) => {
      if (typeof fetch !== "function") return false;
      const load = async (name: string): Promise<AudioBuffer | null> => {
        try {
          const res = await fetch(`${baseUrl}/${name}`);
          if (!res.ok) return null;
          const type = res.headers.get("content-type") ?? "";
          if (type.includes("text/html")) return null;
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      };
      const found: AudioBuffer[] = [];
      for (let i = 1; i <= MAX_TURN_SAMPLES; i++) {
        const b = await load(`turn-${i}.mp3`);
        if (!b) break;
        found.push(b);
      }
      startSample = await load("start.mp3");
      stopSample = await load("stop.mp3");
      if (!disposed) turnSamples = found;
      return found.length > 0;
    },
    dispose: () => {
      disposed = true;
      for (const s of live) {
        try {
          s.stop();
        } catch {
          // Not started or already stopped.
        }
      }
      live.clear();
      try {
        bus.disconnect();
        comp.disconnect();
        clip.disconnect();
        master.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
