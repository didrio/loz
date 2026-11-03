import { describe, expect, it } from 'vitest';
import { checkCourse, COURSES, jumpReach, MAX_RISE, platformPosition, type CourseDef, type PlatformDef } from './platforming';

const slab = (x: number, top: number, extra: Partial<PlatformDef> = {}): PlatformDef => ({ x, z: 0, r: 2, top, ...extra });

/** Three stepping slabs: start, a checkpoint, the goal. Gaps of 2 m, rises of 0.5 m. */
const EASY: CourseDef = {
  platforms: [slab(0, 0), slab(6, 0.5, { checkpoint: true }), slab(12, 1)],
  start: [0, 0],
  goal: [12, 0],
  fallY: -10,
};
const withPlatforms = (platforms: PlatformDef[]): CourseDef => ({ ...EASY, platforms });

describe('platformPosition', () => {
  it('stays put when static', () => expect(platformPosition(slab(0, 0), 3)).toEqual([0, 0, 0]));
  it('eases back and forth over its period, starting at the phase', () => {
    const m = slab(0, 0, { move: { by: [4, 2, -2], period: 4, phase: 0 } });
    expect(platformPosition(m, 0).map(Math.abs)).toEqual([0, 0, 0]);
    const mid = platformPosition(m, 2);
    expect(mid[0]).toBeCloseTo(4); expect(mid[1]).toBeCloseTo(2); expect(mid[2]).toBeCloseTo(-2);
    const quarter = platformPosition(m, 1);
    expect(quarter[0]).toBeCloseTo(2); // halfway, going out
    expect(platformPosition(m, 4)[0]).toBeCloseTo(0);
    const shifted = slab(0, 0, { move: { by: [4, 0, 0], period: 4, phase: 0.5 } });
    expect(platformPosition(shifted, 0)[0]).toBeCloseTo(4);
  });
});

describe('jumpReach', () => {
  it('shrinks as the target rises and grows on drops', () => {
    expect(jumpReach(0)).toBeGreaterThan(4);
    expect(jumpReach(1)).toBeLessThan(jumpReach(0));
    expect(jumpReach(-2)).toBeGreaterThan(jumpReach(0));
  });
  it('is zero above the highest step', () => {
    expect(jumpReach(MAX_RISE + 0.01)).toBe(0);
    expect(MAX_RISE).toBeLessThan(11 ** 2 / 60);
  });
});

describe('checkCourse', () => {
  it('accepts an easy course and reports its hardest jump', () => {
    const r = checkCourse(EASY);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.hardest.gap).toBeCloseTo(2);
  });
  it('flags a moving platform that passes through another, and two that overlap', () => {
    const rise = withPlatforms([slab(0, 0), slab(6, 0.5, { checkpoint: true }), slab(12, 1)]);
    // The first slides along x into the second, at about the same height.
    const slides = { ...rise, platforms: [slab(0, 0, { move: { by: [5, 0, 0], period: 4, phase: 0 } }), ...rise.platforms.slice(1)] };
    expect(checkCourse(slides).problems.join('\n')).toMatch(/pass through each other/);
    // Far enough away, or high enough above, they never meet.
    expect(checkCourse({ ...rise, platforms: [slab(0, 0, { move: { by: [1, 0, 0], period: 4, phase: 0 } }), ...rise.platforms.slice(1)] }).problems.join('\n')).not.toMatch(/pass through/);
    expect(checkCourse(withPlatforms([slab(0, 0), slab(1, 0.2), slab(6, 0.5, { checkpoint: true }), slab(12, 1)])).problems.join('\n')).toMatch(/pass through each other/);
  });
  it('flags a gap too wide to jump', () => {
    const r = checkCourse({ ...withPlatforms([slab(0, 0), slab(6, 0.5, { checkpoint: true }), slab(20, 1)]), goal: [20, 0] });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/goal.*can't be reached/);
  });
  it('flags a step that is too high', () => {
    const r = checkCourse(withPlatforms([slab(0, 0), slab(6, 0.5, { checkpoint: true }), slab(12, 3)]));
    expect(r.ok).toBe(false);
  });
  it('flags a checkpoint that cannot be reached', () => {
    const r = checkCourse(withPlatforms([slab(0, 0), slab(30, 0.5, { checkpoint: true }), slab(12, 1)]));
    expect(r.problems.join('\n')).toMatch(/checkpoint/);
  });
  it('lets a mover bridge a gap that is too wide, but not one it never gets near', () => {
    const wide = (by: [number, number, number]) => withPlatforms([
      slab(0, 0), slab(6, 0.5, { checkpoint: true }),
      slab(12, 1), slab(22, 1, { move: { by, period: 4, phase: 0 } }),
    ]);
    const goalOnMover = (c: CourseDef): CourseDef => ({ ...c, goal: [22, 0] });
    expect(checkCourse(goalOnMover(wide([-4, 0, 0]))).ok).toBe(true);
    expect(checkCourse(goalOnMover(wide([4, 0, 0]))).ok).toBe(false);
  });
  it('flags a platform with too little headroom above another', () => {
    const r = checkCourse(withPlatforms([...EASY.platforms, slab(12, 2.5, { thickness: 0.5 })]));
    expect(r.problems.join('\n')).toMatch(/headroom/);
  });
  it('flags a start that is not on a platform', () => {
    expect(checkCourse({ ...EASY, start: [50, 50] }).ok).toBe(false);
  });
});

describe('registered courses', () => {
  it('are listed in COURSES (each gets its own check below)', () => expect(typeof COURSES).toBe('object'));
  for (const [id, c] of Object.entries(COURSES)) {
    it(`course "${id}" is completable`, () => expect(checkCourse(c).problems).toEqual([]));
  }
});
