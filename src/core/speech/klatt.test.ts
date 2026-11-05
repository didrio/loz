import { describe, expect, it } from 'vitest';
import { synthesize, tiltCoefficient } from './klatt';
import { PHONEMES } from './phonemes';
import { DELIVERIES, PRESET_VOICES, type VoiceProfile } from './profile';
import { prosody, trackAt } from './prosody';
import { LAMP_IS_OUT, bandEnergy, held, phrase, pitchOf, rms, word } from './testKit';
import { CONSONANTS, VOWELS, type Phoneme } from './types';
import { speakPhrases } from './voice';

const FS = 24000;
const woman = PRESET_VOICES.woman;
const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const at = (t: number) => Math.floor(t * FS);
/** The held vowel's segment. */
const vowelSeg = (sp: ReturnType<typeof speakPhrases>) => sp.timeline.segments.find((s) => s.phoneme)!;

describe('klatt: the formant voice', () => {
  it('renders every phoneme and every delivery cleanly: finite, peaks ≤ 0.9, not silent', () => {
    const all = [...VOWELS, ...CONSONANTS] as Phoneme[];
    expect(Object.keys(PHONEMES).sort()).toEqual([...all].sort());
    // Every consonant between vowels, in one line.
    const words = CONSONANTS.map((c) => word(c.toLowerCase(), `AA1 | ${c} IY0`));
    for (const [name, d] of Object.entries(DELIVERIES)) {
      const x = speakPhrases([phrase(words.slice(0, 12), 'continue', 180), phrase(words.slice(12), 'exclaim')], woman, d).samples;
      expect(x.every((v) => Number.isFinite(v)), name).toBe(true);
      expect(peakOf(x), name).toBeLessThanOrEqual(0.9);
      expect(rms(x), name).toBeGreaterThan(0.005);
    }
  });

  it('is deterministic', () => {
    const tl = prosody([LAMP_IS_OUT()], PRESET_VOICES.oldWoman, DELIVERIES.shake);
    expect(synthesize(tl)).toEqual(synthesize(tl));
  });

  it('lasts as long as the timeline and puts a neutral line at a sensible level', () => {
    const sp = speakPhrases([LAMP_IS_OUT()], woman);
    expect(sp.samples.length / FS).toBeCloseTo(sp.timeline.duration, 1);
    expect(peakOf(sp.samples)).toBeGreaterThan(0.2);
    expect(peakOf(sp.samples)).toBeLessThan(0.75);
  });

  it("sings a held vowel at the profile's pitch (±10%) for every preset", () => {
    for (const [name, v] of Object.entries(PRESET_VOICES) as [string, VoiceProfile][]) {
      const sp = speakPhrases(held('AA'), { ...v, rangeSemis: 0 });
      const s = vowelSeg(sp);
      for (let t = s.start + 0.05; t < s.start + s.dur - 0.08; t += 0.05) {
        const { f0 } = pitchOf(sp.samples, FS, at(t), 1200, 60, 600);
        expect(Math.abs(f0 / v.baseF0 - 1), `${name} at ${t.toFixed(2)}`).toBeLessThan(0.1);
      }
      // With its melody on, the measured pitch follows the track.
      const tuned = speakPhrases(held('AA'), v);
      const ts = vowelSeg(tuned);
      const mid = ts.start + ts.dur * 0.4;
      const { f0 } = pitchOf(tuned.samples, FS, at(mid), 1200, 60, 600);
      expect(Math.abs(f0 / trackAt(tuned.timeline.f0, mid + 0.025) - 1), name).toBeLessThan(0.1);
    }
  });

  it('shapes vowels: IY has its energy high (F2 ~2 kHz), AA low (F2 ~1.2 kHz); a smaller tract raises it', () => {
    const man = { ...PRESET_VOICES.man, rangeSemis: 0 };
    // High band (IY's F2–F3) against AA's F2 band, in dB.
    const tilt = (v: Phoneme, voice: VoiceProfile) => {
      const sp = speakPhrases(held(v), voice);
      const a = at(vowelSeg(sp).start + 0.06);
      return 10 * Math.log10(bandEnergy(sp.samples, FS, a, 1024, 1800, 3500) / bandEnergy(sp.samples, FS, a, 1024, 900, 1500));
    };
    expect(tilt('IY', man) - tilt('AA', man)).toBeGreaterThan(15);
    // IY's F2 peak (the loudest 100 Hz bin in 1.5–3.5 kHz) moves up with tractScale.
    const f2 = (voice: VoiceProfile) => {
      const sp = speakPhrases(held('IY'), voice);
      const a = at(vowelSeg(sp).start + 0.06);
      let best = 0;
      let bestF = 0;
      for (let f = 1500; f < 3500; f += 100) {
        const e = bandEnergy(sp.samples, FS, a, 1024, f, f + 100);
        if (e > best) [best, bestF] = [e, f + 50];
      }
      return bestF;
    };
    const ratio = f2({ ...man, tractScale: 1.25 }) / f2(man);
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.35);
  });

  it('ends a yes/no question audibly higher than a statement', () => {
    const lastPitch = (end: 'question' | 'statement') => {
      const sp = speakPhrases([LAMP_IS_OUT(end)], woman);
      const vowel = sp.timeline.segments.filter((s) => s.phoneme === 'AW').pop()!;
      return pitchOf(sp.samples, FS, at(vowel.start + vowel.dur - 0.06), 1000, 70, 600).f0;
    };
    expect(lastPitch('question')).toBeGreaterThan(lastPitch('statement') * 1.3);
  });

  it('is silent in a comma pause', () => {
    const sp = speakPhrases([phrase([word('wait', 'W EY1 T')], 'continue', 250), phrase([word('look', 'L UH1 K')])], woman);
    const pause = sp.timeline.segments.find((s) => !s.phoneme && s.start > 0.1)!;
    const quiet = rms(sp.samples, at(pause.start + 0.08), at(pause.start + pause.dur - 0.02));
    expect(quiet).toBeLessThan(rms(sp.samples) * 0.02);
  });

  it('whispers in the soft delivery: far less periodic than neutral', () => {
    const clarity = (d: typeof DELIVERIES.neutral) => {
      const sp = speakPhrases(held('AA'), woman, d);
      const s = vowelSeg(sp);
      let c = 0;
      let k = 0;
      for (let t = s.start + 0.04; t < s.start + s.dur - 0.08; t += 0.04, k++) c += pitchOf(sp.samples, FS, at(t), 1200, 70, 600).clarity;
      return c / k;
    };
    const neutral = clarity(DELIVERIES.neutral);
    const soft = clarity(DELIVERIES.soft);
    expect(neutral).toBeGreaterThan(0.8);
    expect(soft).toBeLessThan(neutral - 0.3);
  });

  it('renders a 4-second line quickly', () => {
    const words = 'the lamp is out and the road is dark tonight'.split(' ');
    const line = Array.from({ length: 4 }, () => phrase([LAMP_IS_OUT().words, words.map((w) => word(w, 'D AA1 R K'))].flat(), 'continue', 180));
    const tl = prosody(line, woman);
    expect(tl.duration).toBeGreaterThan(4);
    const t0 = performance.now();
    synthesize(tl);
    // Typically ~10 ms per 4 s in Node; generous so a loaded CI machine passes.
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('tilt coefficient is the asked-for dB down at 3 kHz', () => {
    const a = tiltCoefficient(12, 3000, FS);
    const w = (2 * Math.PI * 3000) / FS;
    const g = (1 - a) / Math.hypot(1 - a * Math.cos(w), a * Math.sin(w));
    expect(20 * Math.log10(g)).toBeCloseTo(-12, 1);
    expect(tiltCoefficient(0, 3000, FS)).toBe(0);
  });
});
