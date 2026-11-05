import { describe, expect, it } from 'vitest';
import { blightMood, blighted, fieldPopulation, STRAY_THORNLINGS, stepBlight, THORN_ATTACK } from './blight';

const field = { id: 'overworld', enemyCount: 14 };

describe('the blight', () => {
  it('lies on the open valley until the seal breaks, and nowhere else', () => {
    expect(blighted(field, false)).toBe(true);
    expect(blighted(field, true)).toBe(false);
    expect(blighted({ id: 'shrine', indoor: true }, false)).toBe(false);
    expect(blighted({ id: 'mill', indoor: true }, false)).toBe(false);
  });

  it('lifts in about four seconds and never overshoots', () => {
    let level = 1;
    for (let i = 0; i < 4 * 60; i++) level = stepBlight(level, 0, 1 / 60);
    expect(level).toBeCloseTo(0, 1);
    expect(stepBlight(0.01, 0, 1)).toBe(0);
    expect(stepBlight(0.9, 1, 1)).toBe(1);
  });

  it('leaves the restored field with three stray thornlings and no wisps', () => {
    expect(fieldPopulation(field, false)).toEqual({ thornlings: 14, wisps: true, posts: [] });
    expect(fieldPopulation(field, true)).toEqual({ thornlings: STRAY_THORNLINGS, wisps: false, posts: [] });
    expect(STRAY_THORNLINGS).toBe(3);
  });

  it('mans the blighted field\'s posts out of its thornlings, and leaves them empty once restored', () => {
    const posts = [{ x: 1, z: 2, count: 3 }];
    expect(fieldPopulation({ ...field, enemyPosts: posts }, false)).toEqual({ thornlings: 11, wisps: true, posts });
    expect(fieldPopulation({ ...field, enemyPosts: posts }, true).posts).toEqual([]);
  });

  it('keeps other areas as they are, valleyOpen or not', () => {
    expect(fieldPopulation({ id: 'shrine', indoor: true, enemyCount: 0 }, true)).toEqual({ thornlings: 0, wisps: true, posts: [] });
  });

  it('swaps only the field songs', () => {
    expect(blightMood('day', true)).toBe('blight');
    expect(blightMood('night', true)).toBe('blightNight');
    expect(blightMood('village', true)).toBe('blightVillage');
    expect(blightMood('villageNight', true)).toBe('blightVillage');
    expect(blightMood('day', false)).toBe('day');
    expect(blightMood('boss', true)).toBe('boss');
  });
});

describe('the thorns', () => {
  it('hurt a full heart, through any shield', () => {
    expect(THORN_ATTACK.damage).toBe(2);
    expect(THORN_ATTACK.unblockable).toBe(true);
  });
});
