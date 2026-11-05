import { describe, expect, it } from 'vitest';
import { BLIP_PRESETS, MOODS, blipAt, type Blip, type BlipVoice } from './blips';

/** Every blip of a text, in order. */
function babble(voice: BlipVoice, text: string, mood = {}): Blip[] {
  const state = { letters: 0 };
  const out: Blip[] = [];
  for (let k = 0; k < text.length; k++) {
    const b = blipAt(voice, text, k, state, mood);
    if (b) out.push(b);
  }
  return out;
}

describe('blipAt', () => {
  it('only letters make a blip, one in every `every`', () => {
    const voice = { ...BLIP_PRESETS.woman, every: 2 };
    expect(babble(voice, 'abcd efgh')).toHaveLength(4); // 8 letters
    expect(babble({ ...voice, every: 1 }, 'a, b. c!')).toHaveLength(3);
    expect(babble(voice, '... 123 ---')).toHaveLength(0);
  });

  it('is deterministic, and keeps to the voice\'s range', () => {
    const text = 'Nobody goes past the fence, not since the lantern died.';
    const a = babble(BLIP_PRESETS.man, text);
    expect(babble(BLIP_PRESETS.man, text)).toEqual(a);
    const top = BLIP_PRESETS.man.pitch * 2 ** ((16 * BLIP_PRESETS.man.range + 4) / 12);
    for (const b of a) {
      expect(b.freq).toBeGreaterThan(BLIP_PRESETS.man.pitch * 2 ** (-3 / 12));
      expect(b.freq).toBeLessThan(top);
    }
  });

  it('a question rises at its end, a statement settles', () => {
    const voice = { ...BLIP_PRESETS.woman, every: 1, range: 0 }; // flat, so only the sentence end moves the pitch
    const q = babble(voice, 'Where did she go?');
    const s = babble(voice, 'Where did she go.');
    expect(q[q.length - 1].freq).toBeGreaterThan(q[0].freq);
    expect(s[s.length - 1].freq).toBeLessThan(s[0].freq);
  });

  it('an exclamation is louder at its end', () => {
    const voice = { ...BLIP_PRESETS.boy, every: 1 };
    const b = babble(voice, 'Button! You found her!');
    expect(b[b.length - 1].gain).toBeGreaterThan(voice.gain);
  });

  it('different voices sit at different pitches', () => {
    const text = 'Come back before dark.';
    const mean = (v: BlipVoice) => babble(v, text).reduce((a, b) => a + b.freq, 0) / babble(v, text).length;
    expect(mean(BLIP_PRESETS.boy)).toBeGreaterThan(mean(BLIP_PRESETS.woman));
    expect(mean(BLIP_PRESETS.woman)).toBeGreaterThan(mean(BLIP_PRESETS.oldMan));
  });

  it('moods change the whole page: soft is quieter and rounder, shake wobbles', () => {
    const plain = babble(BLIP_PRESETS.woman, 'Hold on to me.');
    const soft = babble(BLIP_PRESETS.woman, 'Hold on to me.', MOODS.soft);
    const shake = babble(BLIP_PRESETS.woman, 'Hold on to me.', MOODS.shake);
    expect(soft[0].gain).toBeLessThan(plain[0].gain);
    expect(soft[0].cutoff).toBeLessThan(plain[0].cutoff);
    expect(shake[0].wobble).toBeGreaterThan(plain[0].wobble);
  });
});
