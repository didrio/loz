import { describe, expect, it } from 'vitest';
import { DELIVERIES, PRESET_VOICES } from './profile';
import { prosody, trackAt, type Timeline } from './prosody';
import { LAMP_IS_OUT, phrase, word } from './testKit';

const woman = PRESET_VOICES.woman;
const speechSpan = (tl: Timeline) => {
  const sounds = tl.segments.filter((s) => s.phoneme);
  return { start: sounds[0].start, end: sounds[sounds.length - 1].start + sounds[sounds.length - 1].dur };
};
/** The F0 track's mean over the last `len` s of the last voiced segment. */
const endPitch = (tl: Timeline, len = 0.06) => {
  const end = speechSpan(tl).end;
  let s = 0;
  for (let i = 0; i < 6; i++) s += trackAt(tl.f0, end - len + (i * len) / 6);
  return s / 6;
};

describe('prosody: timing', () => {
  it('times a known phrase within natural bounds, back to back, and slows down with rate', () => {
    const tl = prosody([LAMP_IS_OUT()], woman);
    const { start, end } = speechSpan(tl);
    // "The lamp is out." spoken: about 0.7–1.4 s.
    expect(end - start).toBeGreaterThan(0.7);
    expect(end - start).toBeLessThan(1.4);
    for (let i = 1; i < tl.segments.length; i++) {
      const a = tl.segments[i - 1];
      expect(tl.segments[i].start).toBeCloseTo(a.start + a.dur, 9);
      expect(a.dur).toBeGreaterThan(0);
    }
    const slow = speechSpan(prosody([LAMP_IS_OUT()], { ...woman, rate: 0.7 }));
    const fast = speechSpan(prosody([LAMP_IS_OUT()], woman, { ...DELIVERIES.neutral, rate: 1.4 }));
    expect(slow.end - slow.start).toBeGreaterThan((end - start) * 1.2);
    expect(fast.end - fast.start).toBeLessThan((end - start) * 0.85);
  });

  it('applies Klatt rules: phrase-final lengthening, shorter function words and unstressed vowels, longer before voiced consonants', () => {
    // "cat" vs "cab" (vowel before a voiceless vs a voiced stop), phrase-final.
    const vowelOf = (tl: Timeline, w: number) => tl.segments.find((s) => s.word === w && s.phoneme === 'AE')!.dur;
    const cat = prosody([phrase([word('cat', 'K AE1 T')])], woman);
    const cab = prosody([phrase([word('cab', 'K AE1 B')])], woman);
    expect(vowelOf(cab, 0)).toBeGreaterThan(vowelOf(cat, 0) * 1.3);
    // The same word mid-phrase is shorter than at the end.
    const two = prosody([phrase([word('cat', 'K AE1 T'), word('cat', 'K AE1 T')])], woman);
    expect(vowelOf(two, 1)).toBeGreaterThan(vowelOf(two, 0) * 1.25);
    // A function word's vowel is shorter than the same vowel in a content word.
    const fn = prosody([phrase([word('it', 'IH1 T', false), word('sit', 'S IH1 T'), word('now', 'N AW1')])], woman);
    const ihFn = fn.segments.find((s) => s.word === 0 && s.phoneme === 'IH')!.dur;
    const ihContent = fn.segments.find((s) => s.word === 1 && s.phoneme === 'IH')!.dur;
    expect(ihFn).toBeLessThan(ihContent * 0.8);
  });

  it('releases and aspirates stops by context, and taps an intervocalic T', () => {
    const tl = prosody([phrase([word('top', 'T AA1 P'), word('water', 'W AO1 | T ER0')])], woman);
    const [t1, p, t2] = tl.segments.filter((s) => s.phoneme === 'T' || s.phoneme === 'P');
    expect(t1.release).toBeDefined();
    expect(t1.vot).toBeGreaterThan(0.04); // before a stressed vowel: a long breath
    expect(p.release).toBeDefined(); // before W: released, aspirated
    expect(t2.flap).toBe(true);
    expect(t2.dur).toBeLessThan(0.04);
  });

  it('adds the phrase pause after a comma, scaled by rate', () => {
    const phrases = [phrase([word('wait', 'W EY1 T')], 'continue', 180), phrase([word('look', 'L UH1 K')])];
    const tl = prosody(phrases, woman);
    const pause = tl.segments.find((s) => !s.phoneme && s.phrase === 0 && s.start > 0.1)!;
    expect(pause.dur).toBeCloseTo(0.18 / woman.rate, 3);
  });

  it('times every word for typing along: in order, inside the line, with the phonemizer span', () => {
    const tl = prosody([LAMP_IS_OUT('continue'), phrase([word('go', 'G OW1')])], woman);
    expect(tl.words.map((w) => w.text)).toEqual(['the', 'lamp', 'is', 'out', 'go']);
    for (let i = 0; i < tl.words.length; i++) {
      const w = tl.words[i];
      expect(w.end).toBeGreaterThan(w.start);
      if (i > 0) expect(w.start).toBeGreaterThanOrEqual(tl.words[i - 1].end - 1e-9);
      expect(w.end).toBeLessThanOrEqual(tl.duration);
    }
    expect(tl.words[4].phrase).toBe(1);
    expect(tl.words[1].span).toEqual([0, 4]);
  });
});

describe('prosody: melody', () => {
  it('ends a yes/no question high and a statement low', () => {
    const q = prosody([LAMP_IS_OUT('question')], woman);
    const s = prosody([LAMP_IS_OUT('statement')], woman);
    expect(endPitch(q)).toBeGreaterThan(woman.baseF0 * 2 ** (3 / 12));
    expect(endPitch(s)).toBeLessThan(woman.baseF0);
    expect(endPitch(q)).toBeGreaterThan(endPitch(s) * 1.4);
  });

  it('puts a pitch accent on content words, and an exclamation peaks higher than a statement', () => {
    const tl = prosody([LAMP_IS_OUT()], woman);
    const lamp = tl.segments.find((s) => s.phoneme === 'AE')!;
    const the = tl.segments.find((s) => s.phoneme === 'AH')!;
    expect(trackAt(tl.f0, lamp.start + lamp.dur * 0.6)).toBeGreaterThan(trackAt(tl.f0, the.start) * 1.1);
    const peak = (t: Timeline) => Math.max(...t.f0.map((p) => p.v));
    expect(peak(prosody([LAMP_IS_OUT('exclaim')], woman))).toBeGreaterThan(peak(tl) * 1.05);
  });

  it('scales the melody with the voice: range 0 is flat at the base pitch, deliveries shift it', () => {
    const flat = prosody([LAMP_IS_OUT()], { ...woman, rangeSemis: 0 });
    const voiced = flat.f0.filter((p) => p.t > 0.1 && p.t < speechSpan(flat).end);
    for (const p of voiced) expect(Math.abs(Math.log2(p.v / woman.baseF0) * 12)).toBeLessThan(1.2); // micro-prosody only
    const excited = prosody([LAMP_IS_OUT()], woman, DELIVERIES.excited);
    const neutral = prosody([LAMP_IS_OUT()], woman);
    const mean = (t: Timeline) => t.f0.reduce((s, p) => s + p.v, 0) / t.f0.length;
    expect(mean(excited)).toBeGreaterThan(mean(neutral) * 1.1);
  });
});
