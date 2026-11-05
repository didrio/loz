import { describe, expect, it } from 'vitest';
import { DUNGEON_FOG } from './decor';

describe('DUNGEON_FOG', () => {
  it('is a real fog: starts close, ends before the far side of a big room', () => {
    expect(DUNGEON_FOG.near).toBeGreaterThan(0);
    expect(DUNGEON_FOG.near).toBeLessThan(DUNGEON_FOG.far);
    expect(DUNGEON_FOG.far).toBeLessThanOrEqual(40);
  });
});
