import { describe, expect, it } from 'vitest';
import { HAPTIC_PATTERNS, Haptics } from './haptics';

describe('Haptics', () => {
  it('buzzes the pattern for what happened, only while enabled', () => {
    const calls: unknown[] = [];
    const h = new Haptics((p) => (calls.push(p), true));
    h.pulse('hurt');
    h.pulse('guardBreak');
    expect(calls).toEqual([HAPTIC_PATTERNS.hurt, HAPTIC_PATTERNS.guardBreak]);
    h.enabled = false;
    h.pulse('block');
    expect(calls).toHaveLength(2);
  });

  it('does nothing where the device cannot vibrate, and survives a browser that throws', () => {
    const none = new Haptics(null);
    expect(none.supported).toBe(false);
    expect(() => none.pulse('hurt')).not.toThrow();
    const grumpy = new Haptics(() => { throw new Error('no gesture yet'); });
    expect(() => grumpy.pulse('hurt')).not.toThrow();
  });
});
