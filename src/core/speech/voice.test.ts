import { describe, expect, it } from 'vitest';
import { PHONEMES } from './phonemes';
import { LAMP_IS_OUT } from './testKit';
import { DELIVERIES, PRESET_VOICES, resolveVoice, speak, speakPhrases } from './voice';

describe('voice profiles and deliveries', () => {
  it('applies a delivery as offsets and multipliers, clamped', () => {
    const v = resolveVoice(PRESET_VOICES.woman, DELIVERIES.excited);
    expect(v.baseF0).toBeCloseTo(205 * 2 ** (2.5 / 12));
    expect(v.rangeSemis).toBeCloseTo(9 * 1.5);
    expect(v.rate).toBeCloseTo(0.95 * 1.12);
    expect(v.gain).toBeCloseTo(10 ** (2 / 20));
    expect(resolveVoice(PRESET_VOICES.oldWoman, DELIVERIES.soft).breathiness).toBe(1);
    expect(resolveVoice(PRESET_VOICES.woman, DELIVERIES.shake).tremorDepth).toBeGreaterThan(0.5);
  });

  it('speakPhrases returns samples, rate and the timeline', () => {
    const sp = speakPhrases([LAMP_IS_OUT()], PRESET_VOICES.child, DELIVERIES.worried, 16000);
    expect(sp.sampleRate).toBe(16000);
    expect(sp.samples.length / 16000).toBeCloseTo(sp.timeline.duration, 1);
    expect(sp.timeline.words).toHaveLength(4);
  });

  it('has sane inventory entries: min ≤ inherent, diphthongs glide, stops burst', () => {
    for (const [ph, s] of Object.entries(PHONEMES)) {
      expect(s.min, ph).toBeLessThanOrEqual(s.inherent);
      if (s.manner === 'diphthong') expect(s.glide, ph).toBeDefined();
      if (s.manner === 'stop' || s.manner === 'affricate') expect(s.burst, ph).toBeDefined();
    }
  });
});

describe('speak', () => {
  it('speaks the three trial lines end to end, words in order and within the sound', () => {
    const lines = [
      'Wren! Quietly! Nobody goes past the fence, not since the lantern died and the sky turned. You know that.',
      'You look like you haven\'t slept in a week. The mill door, west side of the square. There\'s a bed doing nothing.',
      'Button! You found her! She\'s not even wet.',
    ];
    for (const text of lines) {
      const s = speak(text, PRESET_VOICES.woman);
      const t = s.timeline;
      expect(s.samples.length / s.sampleRate).toBeCloseTo(t.duration, 1);
      expect(t.words.length).toBe(text.split(/\s+/).length);
      for (let i = 1; i < t.words.length; i++) expect(t.words[i].start).toBeGreaterThanOrEqual(t.words[i - 1].end - 1e-9);
      expect(t.words.at(-1)!.end).toBeLessThanOrEqual(t.duration);
      expect(s.samples.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('loudness', () => {
  it('evens out voices: only the delivery makes a line louder', () => {
    const level = (s: { samples: Float32Array }) => {
      let pk = 0;
      for (const v of s.samples) pk = Math.max(pk, Math.abs(v));
      let sq = 0;
      let n = 0;
      for (const v of s.samples) if (Math.abs(v) > pk * 0.02) (sq += v * v), n++;
      return 20 * Math.log10(Math.sqrt(sq / n));
    };
    const text = 'Button! You found her! She\'s not even wet.';
    const child = level(speak(text, PRESET_VOICES.child));
    const man = level(speak(text, PRESET_VOICES.man));
    expect(Math.abs(child - man)).toBeLessThan(1.5);
    const excited = level(speak(text, PRESET_VOICES.man, DELIVERIES.excited));
    expect(excited - man).toBeGreaterThan(1);
    expect(excited - man).toBeLessThan(3);
  });
});
