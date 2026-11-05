/**
 * The formant voice: a Klatt-style cascade/parallel synthesizer, rendered sample by sample.
 * Like a subtractive synth with a very particular patch:
 * - oscillator: the glottal source (KLGLOTT88: the airflow pulse of the vocal folds, with an open
 *   quotient and a tilt low-pass for softness, plus jitter, shimmer, flutter and tremor so it never
 *   sounds like a machine), and two noise sources (breath and hiss);
 * - filters: the vocal tract as a chain of resonators (formants F1–F5 plus a nasal pole/zero) for
 *   voice and breath, and a parallel bank (F2–F6 plus a flat bypass) for hiss and bursts.
 *
 * Pure functions on arrays: no Web Audio, so it runs in tests and Node. Seeded, so the same
 * timeline always renders the same samples.
 */
import { clamp, mulberry32, smoothstep } from '../../core/math';
import { buildFrames, type Frames } from './frames';
import type { ResolvedVoice } from './profile';
import type { Timeline } from './prosody';

/** A two-pole resonator (Klatt's difference equation, unity gain at 0 Hz unless normalized to its peak). */
class Resonator {
  a = 1;
  b = 0;
  c = 0;
  private y1 = 0;
  private y2 = 0;
  set(f: number, bw: number, fs: number, peakNormalize = false) {
    const r = Math.exp((-Math.PI * bw) / fs);
    this.c = -r * r;
    this.b = 2 * r * Math.cos((2 * Math.PI * f) / fs);
    this.a = 1 - this.b - this.c;
    if (peakNormalize) {
      // Scale so the gain at the center frequency is 1: the parallel branch's dB set the peaks directly.
      const w = (2 * Math.PI * f) / fs;
      const re = 1 - this.b * Math.cos(w) - this.c * Math.cos(2 * w);
      const im = this.b * Math.sin(w) + this.c * Math.sin(2 * w);
      this.a = Math.sqrt(re * re + im * im);
    }
  }
  tick(x: number) {
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** The inverse of a resonator: a notch (the nasal zero). */
class AntiResonator {
  private a = 1;
  private b = 0;
  private c = 0;
  private x1 = 0;
  private x2 = 0;
  set(f: number, bw: number, fs: number) {
    const r = Math.exp((-Math.PI * bw) / fs);
    const c = -r * r;
    const b = 2 * r * Math.cos((2 * Math.PI * f) / fs);
    const a = 1 - b - c;
    this.a = 1 / a;
    this.b = -b / a;
    this.c = -c / a;
  }
  tick(x: number) {
    const y = this.a * x + this.b * this.x1 + this.c * this.x2;
    this.x2 = this.x1;
    this.x1 = x;
    return y;
  }
}

/** One-pole low-pass coefficient that is `db` down at `f` Hz (the source's spectral tilt). */
export function tiltCoefficient(db: number, f: number, fs: number) {
  if (db <= 0) return 0;
  const g2 = 10 ** (-db / 10);
  const cw = Math.cos((2 * Math.PI * f) / fs);
  // |(1−a) / (1 − a e^{−jw})|² = g2  →  (1−g2)a² − 2(1 − g2·cw)a + (1−g2) = 0, smaller root.
  const A = 1 - g2;
  const B = -2 * (1 - g2 * cw);
  const disc = B * B - 4 * A * A;
  return clamp((-B - Math.sqrt(Math.max(0, disc))) / (2 * A), 0, 0.99);
}

/**
 * Overall output gain: puts a neutral stressed vowel's peaks around 0.5, leaving headroom for
 * excited lines. Measured, not derived (see the tests' level check).
 */
const MASTER = 0.24;
/** Noise sources' levels relative to the voice (calibrated by measurement: /s/ ~12 dB under a vowel, /h/ ~15 dB). */
const ASPIRATION = 0.3;
const FRICATION = 1.95;
/** The flat bypass is broadband, so it carries far more power than one resonance at the same dB. */
const BYPASS = 0.1;
/** The voice bar (a voiced closure's low hum) through its low-pass. */
const VOICE_BAR = 1.2;
/** Klatt's flutter: the slow natural wander of pitch (his FL, percent). */
const FLUTTER = 20;
const PEAK = 0.9;
/** The speech level a line is normalized to, as RMS over its voiced and noisy parts (not its pauses), before the delivery's gain. */
const SPEECH_RMS = 0.1;

export interface SynthOptions {
  seed?: number;
}

/** Render a timeline to mono samples in [−1, 1]. */
export function synthesize(timeline: Timeline, sampleRate = 24000, options: SynthOptions = {}): Float32Array {
  return renderFrames(buildFrames(timeline), timeline.voice, sampleRate, options);
}

export function renderFrames(frames: Frames, voice: ResolvedVoice, fs = 24000, options: SynthOptions = {}): Float32Array {
  const n = Math.max(1, Math.floor((frames.count - 1) * frames.step * fs));
  const out = new Float32Array(n);
  const rand = mulberry32(options.seed ?? 0x5eed);
  const P = frames.p;
  const block = Math.max(8, Math.round(fs * 0.001));

  const rnp = new Resonator();
  const rnz = new AntiResonator();
  const r1 = new Resonator();
  const r2 = new Resonator();
  const r3 = new Resonator();
  const r4 = new Resonator();
  const r5 = new Resonator();
  const p2 = new Resonator();
  const p3 = new Resonator();
  const p4 = new Resonator();
  const p5 = new Resonator();
  const p6 = new Resonator();

  // Glottal source state.
  let pos = 1e9; // samples into the current period (starts a new period at once)
  let period = 1;
  let open = 1;
  let pulseAmp = 1;
  let tiltY = 0;
  let barY1 = 0;
  let barY2 = 0;
  let aspY = 0;
  // Output DC blocker.
  let dcX = 0;
  let dcY = 0;
  const dcR = Math.exp((-2 * Math.PI * 20) / fs);
  const barK = 1 - Math.exp((-2 * Math.PI * 180) / fs);
  const aspK = 1 - Math.exp((-2 * Math.PI * 5000) / fs);

  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.732;
  const noise = () => rand() * 2 - 1;
  const frameAt = (k: Float32Array, x: number) => {
    const i = Math.min(frames.count - 2, Math.floor(x));
    const w = x - i;
    return k[i] + (k[i + 1] - k[i]) * w;
  };

  const tremorDepth = voice.tremorDepth;
  const tremorW = 2 * Math.PI * voice.tremorRate;
  let peak = 0;

  // Per-block values, linear-ramped per sample: [start, end].
  let av0 = 0, ah0 = 0, avs0 = 0, br0 = 0;
  for (let s0 = 0; s0 < n; s0 += block) {
    const s1 = Math.min(n, s0 + block);
    const fx0 = s0 / fs / frames.step;
    const fx1 = s1 / fs / frames.step;
    if (s0 === 0) {
      av0 = frameAt(P.av, fx0);
      ah0 = frameAt(P.ah, fx0);
      avs0 = frameAt(P.avs, fx0);
      br0 = frameAt(P.breath, fx0);
    }
    const av1 = frameAt(P.av, fx1);
    const ah1 = frameAt(P.ah, fx1);
    const avs1 = frameAt(P.avs, fx1);
    const br1 = frameAt(P.breath, fx1);
    const xm = (fx0 + fx1) / 2;

    // Filters: set once per block (Klatt updated every 5 ms; 1 ms keeps fast glides clean).
    rnp.set(frameAt(P.fnp, xm), frameAt(P.bnp, xm), fs);
    rnz.set(frameAt(P.fnz, xm), frameAt(P.bnz, xm), fs);
    r1.set(frameAt(P.f1, xm), frameAt(P.b1, xm), fs);
    r2.set(frameAt(P.f2, xm), frameAt(P.b2, xm), fs);
    r3.set(frameAt(P.f3, xm), frameAt(P.b3, xm), fs);
    r4.set(frameAt(P.f4, xm), frameAt(P.b4, xm), fs);
    r5.set(Math.min(frameAt(P.f5, xm), fs * 0.45), frameAt(P.b5, xm), fs);
    const g2 = frameAt(P.g2, xm);
    const g3 = frameAt(P.g3, xm);
    const g4 = frameAt(P.g4, xm);
    const g5 = frameAt(P.g5, xm);
    const g6 = frameAt(P.g6, xm);
    const gb = frameAt(P.gb, xm);
    const parallelOn = g2 + g3 + g4 + g5 + g6 + gb > 1e-6;
    if (parallelOn) {
      p2.set(frameAt(P.f2, xm), Math.max(frameAt(P.b2, xm), 150), fs, true);
      p3.set(frameAt(P.f3, xm), Math.max(frameAt(P.b3, xm), 200), fs, true);
      p4.set(frameAt(P.f4, xm), Math.max(frameAt(P.b4, xm), 250), fs, true);
      p5.set(Math.min(frameAt(P.f5, xm), fs * 0.45), Math.max(frameAt(P.b5, xm), 300), fs, true);
      p6.set(Math.min(frameAt(P.f6, xm), fs * 0.45), frameAt(P.b6, xm), fs, true);
    }
    const voicedFric = frameAt(P.voicedFric, xm);
    const breath = frameAt(P.breath, xm);
    // Breathiness: a wider-open, darker pulse, breath noise under it, and above ~0.5 the voice gives way to a whisper.
    const oq = clamp(frameAt(P.oq, xm) + 0.22 * breath, 0.3, 0.9);
    const tiltA = tiltCoefficient(frameAt(P.tilt, xm) + 6 * breath, 3000, fs);
    const voiceKeep = 1 - 0.9 * smoothstep(0.45, 1, breath);
    const f0Base = frameAt(P.f0, xm);

    const len = s1 - s0;
    for (let s = s0; s < s1; s++) {
      const w = (s - s0) / len;
      const av = av0 + (av1 - av0) * w;
      const ah = ah0 + (ah1 - ah0) * w;
      const avs = avs0 + (avs1 - avs0) * w;
      const br = br0 + (br1 - br0) * w;
      const t = s / fs;

      // A new glottal period: pitch with flutter, tremor and jitter; amplitude with shimmer and tremor.
      if (pos >= period) {
        pos -= period;
        if (pos > period) pos = 0;
        const flutter = (FLUTTER / 50) * (f0Base / 100) * (Math.sin(2 * Math.PI * 12.7 * t) + Math.sin(2 * Math.PI * 7.1 * t) + Math.sin(2 * Math.PI * 4.7 * t));
        const trem = tremorDepth > 0 ? Math.sin(tremorW * t) : 0;
        const f0 = Math.max(40, (f0Base + flutter) * 2 ** ((tremorDepth * trem) / 12));
        period = (fs / f0) * (1 + voice.jitter * clamp(gauss(), -3, 3));
        open = oq * period;
        pulseAmp = 10 ** ((voice.shimmer * clamp(gauss(), -3, 3)) / 20) * (1 + 0.12 * tremorDepth * trem);
      }

      // KLGLOTT88 flow derivative: 2x − 3x² over the open phase, then closed; polyBLEP smooths the closing step.
      let g = 0;
      const isOpen = pos < open;
      if (isOpen) {
        const x = pos / open;
        g = 2 * x - 3 * x * x;
      }
      const d = pos - open;
      if (d >= 0 && d < 1) g -= (1 - d) * (1 - d) * 0.5;
      else if (d < 0 && d > -1) g += (d + 1) * (d + 1) * 0.5;
      g *= pulseAmp;
      pos += 1;

      tiltY = (1 - tiltA) * g + tiltA * tiltY;
      let src = tiltY * av * voiceKeep;
      if (avs > 0) {
        barY1 += barK * (g - barY1);
        barY2 += barK * (barY1 - barY2);
        src += barY2 * avs * VOICE_BAR;
      }
      // Breath: aspiration (H, the puff after P/T/K) plus the voice's own breathiness, which rides the glottal cycle.
      aspY += aspK * (noise() - aspY);
      const breathLevel = br <= 0 ? 0 : 10 ** ((-23 + 30 * br) / 20);
      src += aspY * ASPIRATION * (ah + av * breathLevel * (isOpen ? 1 : 0.35));

      // Cascade: nasal pole and zero, then F1..F5.
      let y = rnz.tick(rnp.tick(src));
      y = r5.tick(r4.tick(r3.tick(r2.tick(r1.tick(y)))));

      // Parallel: frication and bursts (a voiced fricative's hiss pulses with the voice).
      if (parallelOn) {
        let fn = noise() * FRICATION;
        if (voicedFric > 0) fn *= 1 - 0.5 * voicedFric * (isOpen ? 0 : 1);
        y += p2.tick(fn) * g2 - p3.tick(fn) * g3 + p4.tick(fn) * g4 - p5.tick(fn) * g5 + p6.tick(fn) * g6 + fn * gb * BYPASS;
      }

      // DC block, gain.
      const o = y - dcX + dcR * dcY;
      dcX = y;
      dcY = o;
      const v = o * MASTER * voice.gain;
      out[s] = v;
      const m = v < 0 ? -v : v;
      if (m > peak) peak = m;
    }
    av0 = av1;
    ah0 = ah1;
    avs0 = avs1;
    br0 = br1;
  }

  // Even out loudness between voices and lines: a child's high, bright voice measures ~6 dB hotter than a man's
  // at the same settings. Scale the line so its speech (not its pauses) sits at SPEECH_RMS × the delivery's gain.
  let sq = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const m = out[i] < 0 ? -out[i] : out[i];
    if (m > peak * 0.02) {
      sq += out[i] * out[i];
      count++;
    }
  }
  if (count > 0 && sq > 0) {
    const k = (SPEECH_RMS * voice.gain) / Math.sqrt(sq / count);
    for (let i = 0; i < n; i++) out[i] *= k;
    peak *= k;
  }

  // Keep peaks ≤ 0.9: a gentle static soft knee above 0.75 (no time constants, so nothing pumps), and a
  // whole-line scale only if it's still too hot.
  if (peak > 0.75) {
    let p2max = 0;
    for (let i = 0; i < n; i++) {
      const v = out[i];
      const m = Math.abs(v);
      if (m > 0.75) out[i] = Math.sign(v) * (0.75 + 0.2 * Math.tanh((m - 0.75) / 0.2));
      p2max = Math.max(p2max, Math.abs(out[i]));
    }
    if (p2max > PEAK) {
      const k = PEAK / p2max;
      for (let i = 0; i < n; i++) out[i] *= k;
    }
  }
  return out;
}
