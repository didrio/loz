import { describe, expect, it } from 'vitest';
import { checkCourse, COURSES } from '../platforming';
import { GORGE_BELL, GORGE_COURSE, GORGE_SENTINEL, GORGE_THORNLINGS, gorgeAt, onGorgeFloor } from './gorge';
import { GORGE, GORGE_LENGTH, gorgeFrame, terrainHeight } from './layout';

describe('the gorge climb', () => {
  it('can be finished: from the start and from every checkpoint', () => {
    const r = checkCourse(GORGE_COURSE);
    expect(r.problems).toEqual([]);
    expect(r.hardest.gap).toBeLessThan(4.5); // gentle: the gorge mostly teaches
  });

  it('is registered with the courses and ends where the bell is', () => {
    expect(COURSES.gorge).toBe(GORGE_COURSE);
    const last = GORGE_COURSE.platforms.at(-1)!;
    expect([GORGE_BELL.x, GORGE_BELL.z, GORGE_BELL.y]).toEqual([last.x, last.z, last.top]);
  });

  it('keeps every pillar inside the corridor, over the pit', () => {
    for (const [i, p] of GORGE_COURSE.platforms.entries()) {
      const f = gorgeFrame(p.x, p.z);
      expect(f.d + p.r).toBeLessThan(GORGE.halfWidth + 1); // a slider starts left and ends as far right
      expect(f.s).toBeGreaterThan(GORGE.pitAt);
      expect(f.s).toBeLessThan(GORGE_LENGTH);
      if (i > 0) expect(terrainHeight(p.x, p.z)).toBeLessThan(p.top - 3); // the pit is under it
    }
  });

  it('puts the monsters on the corridor floor before the pit', () => {
    for (const [s, lat] of [...GORGE_THORNLINGS, GORGE_SENTINEL.concat(0) as [number, number]]) {
      const { x, z } = gorgeAt(s, lat);
      expect(onGorgeFloor({ x, z })).toBe(true);
      expect(terrainHeight(x, z)).toBeCloseTo(GORGE.floor, 0);
    }
  });
});
