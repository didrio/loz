/**
 * For the speech tests (and tuning scripts): build `Phrase[]` by hand in CMUdict notation, and
 * measure rendered audio (pitch by autocorrelation, band energy, RMS) since we can't listen.
 */
import type { Phoneme, Phrase, PhraseEnd, SpokenWord, Stress } from './types';

/** `word('hello', 'HH AH0 | L OW1')`: syllables split by `|`, stress digits on vowels. */
export function word(text: string, syllables: string, content = true): SpokenWord {
  return {
    text,
    content,
    span: [0, text.length],
    syllables: syllables.split('|').map((syl) => {
      let stress: Stress = 0;
      const phonemes = syl.trim().split(/\s+/).map((p) => {
        const m = /^([A-Z]+)([012])?$/.exec(p);
        if (!m) throw new Error(`bad phoneme ${p}`);
        if (m[2]) stress = Number(m[2]) as Stress;
        return m[1] as Phoneme;
      });
      return { phonemes, stress };
    }),
  };
}

export const phrase = (words: SpokenWord[], end: PhraseEnd = 'statement', pauseMs = 420): Phrase => ({ words, end, pauseMs });

/** "The lamp is out." */
export const LAMP_IS_OUT = (end: PhraseEnd = 'statement') =>
  phrase([word('the', 'DH AH0', false), word('lamp', 'L AE1 M P'), word('is', 'IH1 Z', false), word('out', 'AW1 T')], end);

/** A held vowel as one stressed one-syllable word. */
export const held = (v: Phoneme) => [phrase([word(v.toLowerCase(), `${v}1`)])];

export function rms(x: Float32Array, a = 0, b = x.length) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

/**
 * Pitch of a window by normalized autocorrelation: { f0 Hz, clarity 0–1 } where clarity is the
 * correlation at the best lag (1 = perfectly periodic, ~0 = noise).
 */
export function pitchOf(x: Float32Array, fs: number, a: number, len: number, fMin = 60, fMax = 500) {
  const lagMin = Math.floor(fs / fMax);
  const lagMax = Math.ceil(fs / fMin);
  let best = 0;
  let bestLag = 0;
  const n = len - lagMax;
  const corr = (lag: number) => {
    let s = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = a; i < a + n; i++) {
      s += x[i] * x[i + lag];
      e0 += x[i] * x[i];
      e1 += x[i + lag] * x[i + lag];
    }
    return s / Math.sqrt(e0 * e1 + 1e-12);
  };
  const c = new Float64Array(lagMax + 2);
  for (let lag = lagMin; lag <= lagMax + 1; lag++) c[lag] = corr(lag);
  for (let lag = lagMin + 1; lag <= lagMax; lag++) {
    if (c[lag] > best && c[lag] >= c[lag - 1] && c[lag] >= c[lag + 1]) {
      best = c[lag];
      bestLag = lag;
    }
  }
  // Prefer the shortest lag that is nearly as good (avoid picking a multiple of the period).
  for (let lag = lagMin + 1; lag < bestLag; lag++) {
    if (c[lag] > 0.9 * best && c[lag] >= c[lag - 1] && c[lag] >= c[lag + 1]) {
      best = c[lag];
      bestLag = lag;
      break;
    }
  }
  if (!bestLag) return { f0: 0, clarity: 0 };
  // Parabolic interpolation around the peak.
  const y0 = c[bestLag - 1];
  const y1 = c[bestLag];
  const y2 = c[bestLag + 1];
  const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return { f0: fs / (bestLag + shift), clarity: best };
}

/** Energy (sum of squared DFT magnitudes) in [lo, hi) Hz over a Hann window. Slow DFT: for tests only. */
export function bandEnergy(x: Float32Array, fs: number, a: number, len: number, lo: number, hi: number) {
  let e = 0;
  const df = fs / len;
  for (let k = Math.ceil(lo / df); k < Math.min(len / 2, hi / df); k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / len;
    for (let i = 0; i < len; i++) {
      const v = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
      re += v * Math.cos(w * i);
      im -= v * Math.sin(w * i);
    }
    e += re * re + im * im;
  }
  return e;
}

/** Spectral centroid in Hz over [a, a+len), up to `maxHz`. */
export function centroid(x: Float32Array, fs: number, a: number, len: number, maxHz = 5000) {
  let num = 0;
  let den = 0;
  const df = fs / len;
  for (let k = 1; k < Math.min(len / 2, maxHz / df); k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / len;
    for (let i = 0; i < len; i++) {
      const v = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
      re += v * Math.cos(w * i);
      im -= v * Math.sin(w * i);
    }
    const m = re * re + im * im;
    num += m * k * df;
    den += m;
  }
  return num / (den || 1);
}
