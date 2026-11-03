import { describe, expect, it } from 'vitest';
import { checkCourse, COURSES } from '../platforming';
import { BEYOND, BEYOND_LENGTH, beyondFrame, PASS, terrainHeight } from './layout';
import { beyondAt, CANYON_COURSE, CRAGSTALKER_AT, FAR_SIDE_FROM, inCrossing, onFarSide, WAYBELL_AT, WAYBELL_PICKUP, WAYBELL_POST } from './camp';

describe('the canyon beyond the camp', () => {
  it('can be crossed: from the start and from every checkpoint', () => {
    const r = checkCourse(CANYON_COURSE);
    expect(r.problems).toEqual([]);
    expect(r.hardest.gap).toBeLessThan(4.5);
    expect(COURSES.canyon).toBe(CANYON_COURSE);
  });

  it('starts and ends on solid ground, with every ledge between over the chasm and inside the walls', () => {
    const ps = CANYON_COURSE.platforms;
    const first = ps[0], last = ps[ps.length - 1];
    expect(terrainHeight(first.x, first.z)).toBeCloseTo(BEYOND.floor, 0);
    expect(terrainHeight(last.x, last.z)).toBeCloseTo(BEYOND.floor, 0);
    for (const p of ps.slice(1, -1)) {
      expect(terrainHeight(p.x, p.z)).toBeLessThan(p.top - 3);
      expect(beyondFrame(p.x, p.z).d + p.r).toBeLessThan(BEYOND.halfWidth + 3);
    }
    for (const p of ps) expect(inCrossing(p.x, p.z)).toBe(true);
  });

  it('is a chasm across the whole canyon: no way round it', () => {
    for (const lat of [-4, -2, 0, 2, 4]) {
      const { x, z } = beyondAt((BEYOND.pitFrom + BEYOND.pitTo) / 2, lat);
      expect(terrainHeight(x, z), `lat ${lat}`).toBeLessThan(BEYOND.floor - 3);
    }
  });

  it('keeps the camp flat where it meets the canyon, and the far side flat and inside the region', () => {
    for (const s of [0, 6, 12, 18, 45, 52, WAYBELL_AT]) {
      const { x, z } = beyondAt(s);
      expect(terrainHeight(x, z), `s ${s}`).toBeCloseTo(BEYOND.floor, 0);
    }
    expect(BEYOND_LENGTH).toBeGreaterThan(WAYBELL_AT + 4);
    expect(PASS.camp.z - BEYOND_LENGTH).toBeGreaterThan(-328); // short of the region's far wall
  });

  it('puts the Cragstalker and the bell on the far side, with the bell behind it', () => {
    expect(CRAGSTALKER_AT).toBeGreaterThan(FAR_SIDE_FROM);
    expect(WAYBELL_AT).toBeGreaterThan(CRAGSTALKER_AT);
    expect(onFarSide(beyondAt(CRAGSTALKER_AT))).toBe(true);
    expect(onFarSide(WAYBELL_PICKUP)).toBe(true);
    expect(onFarSide(beyondAt(30))).toBe(false); // it never walks out onto the crossing
    expect(onFarSide(beyondAt(10))).toBe(false); // nor into the camp
  });

  it('keeps the post in the camp, away from the canyon\'s mouth and the pass', () => {
    expect(Math.hypot(WAYBELL_POST.x - PASS.camp.x, WAYBELL_POST.z - PASS.camp.z)).toBeLessThan(PASS.camp.r - 6);
    expect(terrainHeight(WAYBELL_POST.x, WAYBELL_POST.z)).toBeCloseTo(PASS.floor, 0);
  });
});
