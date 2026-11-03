import { describe, expect, it } from 'vitest';
import { GameState } from './state';

describe('GameState', () => {
  it('starts a new game with nothing: no flags, no keys, full hearts', () => {
    const s = new GameState();
    expect(s.keys).toBe(0);
    expect(s.flags.size).toBe(0);
    expect(s.hp).toBe(s.maxHp);
  });

  it('keeps read sigils (and broken jars) through a save and load', () => {
    const s = new GameState();
    s.set('sigil.cell');
    s.set('jar.ruins.1');
    s.set('hint.tunic');
    const back = new GameState();
    back.load(s.toSave());
    expect([...back.flags].sort()).toEqual(['hint.tunic', 'jar.ruins.1', 'sigil.cell']);
  });

  it('keeps hearts and gems in range', () => {
    const s = new GameState();
    s.damage(100);
    expect(s.hp).toBe(0);
    s.heal(100);
    expect(s.hp).toBe(s.maxHp);
    s.addGems(20000);
    expect(s.gems).toBe(9999);
  });

  it('rolls the clock into the next day and knows night from day', () => {
    const s = new GameState();
    s.hours = 23;
    s.advance(2);
    expect(s.day).toBe(2);
    expect(s.hours).toBeCloseTo(1);
    expect(s.isNight).toBe(true);
    s.hours = 12;
    expect(s.isNight).toBe(false);
  });

  it('resets in place so references stay valid', () => {
    const s = new GameState();
    const flags = s.flags;
    s.set('hasSword');
    s.reset();
    expect(s.flags).toBe(flags);
    expect(flags.size).toBe(0);
  });
});

describe('GameState invincibility (dev menu)', () => {
  it('damage does nothing while on, and works again after', () => {
    const s = new GameState();
    s.invincible = true;
    s.damage(2);
    expect(s.hp).toBe(6);
    s.invincible = false;
    s.damage(2);
    expect(s.hp).toBe(4);
  });
});
