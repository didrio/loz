import { describe, expect, it } from 'vitest';
import { GAUGE_LINGER, Guard, GUARD_BREAK, GUARD_REGEN } from './guard';

describe('Guard', () => {
  it('starts with all three slots up', () => {
    const g = new Guard();
    expect(g.slots).toBe(3);
    expect(g.canBlock).toBe(true);
  });

  it('knocks down as many slots as the attack costs', () => {
    const g = new Guard();
    expect(g.block(1)).toBe('blocked');
    expect(g.slots).toBe(2);
    expect(g.block(2)).toBe('blocked');
    expect(g.slots).toBe(0);
    expect(g.canBlock).toBe(true); // empty, but not broken
  });

  it('breaks when an attack costs more than the slots left', () => {
    const g = new Guard();
    g.block(2);
    expect(g.block(2)).toBe('broken');
    expect(g.slots).toBe(0);
    expect(g.canBlock).toBe(false);
    g.update(GUARD_BREAK - 0.01, false);
    expect(g.canBlock).toBe(false);
    g.update(0.02, false);
    expect(g.canBlock).toBe(true);
  });

  it('breaks on any block with no slots up', () => {
    const g = new Guard();
    g.block(3);
    expect(g.block(1)).toBe('broken');
  });

  it('a crushing attack (3) is blockable only with a full guard', () => {
    const full = new Guard();
    expect(full.block(3)).toBe('blocked');
    const worn = new Guard();
    worn.block(1);
    expect(worn.block(3)).toBe('broken');
  });

  it('each slot comes back on its own timer', () => {
    const g = new Guard();
    g.block(1); // slot A down at t = 0
    g.update(1, false);
    g.block(1); // slot B down at t = 1
    expect(g.slots).toBe(1);
    g.update(GUARD_REGEN - 1 + 0.01, false); // t ≈ 2: A is back
    expect(g.slots).toBe(2);
    g.update(1, false); // t ≈ 3: B is back
    expect(g.slots).toBe(3);
  });

  it('slots knocked down together come back together', () => {
    const g = new Guard();
    g.block(3);
    g.update(GUARD_REGEN - 0.01, false);
    expect(g.slots).toBe(0);
    g.update(0.02, false);
    expect(g.slots).toBe(3);
  });

  it('reports fills for the HUD, fullest first', () => {
    const g = new Guard();
    g.block(1);
    g.update(GUARD_REGEN / 2, false);
    expect(g.fills()).toEqual([1, 1, 0.5]);
  });

  it('slots only recover while the shield is lowered (timers pause, they do not reset)', () => {
    const g = new Guard();
    g.block(1);
    g.update(GUARD_REGEN * 5, true); // held up the whole time: nothing comes back
    expect(g.slots).toBe(2);
    g.update(GUARD_REGEN / 2, false);
    g.update(GUARD_REGEN * 5, true); // raised again halfway: progress is kept
    expect(g.slots).toBe(2);
    g.update(GUARD_REGEN / 2 + 0.01, false);
    expect(g.slots).toBe(3);
  });

  it('keeps blocking light hits until it breaks, if the shield is never lowered', () => {
    const g = new Guard();
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(g.block(1));
      g.update(1.5, true);
    }
    expect(results).toEqual(['blocked', 'blocked', 'blocked', 'broken']);
  });

  it('recovers during a guard break (the shield is down then)', () => {
    const g = new Guard();
    g.block(3);
    g.block(1); // breaks
    g.update(GUARD_BREAK + 0.01, false);
    expect(g.canBlock).toBe(true);
    expect(g.slots).toBe(3);
  });

  it('shows the gauge after shield damage, and hides it a moment after it is full again', () => {
    const g = new Guard();
    g.update(0.1, false);
    expect(g.gaugeVisible).toBe(false);
    g.block(1);
    g.update(0.1, true);
    expect(g.gaugeVisible).toBe(true);
    g.update(GUARD_REGEN, false); // refilled
    expect(g.slots).toBe(3);
    expect(g.gaugeVisible).toBe(true); // lingers so you can see it's full
    g.update(GAUGE_LINGER + 0.01, false);
    expect(g.gaugeVisible).toBe(false);
  });
});
