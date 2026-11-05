import { describe, expect, it } from 'vitest';
import { voiceGain } from './audio';

describe('the voice volume', () => {
  it('plays the default slider (80%) as loud as 30% used to be, and scales evenly', () => {
    expect(voiceGain(0.8)).toBeCloseTo(0.3 / 0.8, 6);
    expect(voiceGain(0.4)).toBeCloseTo(voiceGain(0.8) / 2, 6);
    expect(voiceGain(0)).toBe(0);
  });
});
