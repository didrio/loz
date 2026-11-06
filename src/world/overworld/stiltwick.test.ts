import { describe, expect, it } from 'vitest';
import { DEEP_DEPTH } from '../../game/water';
import { terrainHeight } from './layout';
import { CAUSEWAYS, MERE_WATER, STILTWICK } from './mere';
import { DECK, DECKS, HOUSES, houseFrame, onDeck, PLAZA, STILTWICK_SITES } from './stiltwick';

describe('Stiltwick', () => {
  it('puts every site on a deck, 1.5 m from its edge', () => {
    const { bell, stall, people, ferry } = STILTWICK_SITES;
    expect(people.length).toBeGreaterThanOrEqual(5);
    for (const p of [bell, stall, ...people]) expect(onDeck(p.x, p.z, 1.5), JSON.stringify(p)).toBe(true);
    expect(onDeck(ferry.x, ferry.z)).toBe(false); // the ferry's boat floats beside the landing
  });

  it('keeps the people clear of each other and of the bell', () => {
    const { bell, people } = STILTWICK_SITES;
    const all = [{ id: 'bell', ...bell }, ...people];
    for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) expect(Math.hypot(all[i].x - all[k].x, all[i].z - all[k].z), `${all[i].id} ${all[k].id}`).toBeGreaterThan(3);
  });

  it('joins every deck to the plaza, and the plaza to both causeways, level with them', () => {
    const touches = (a: (typeof DECKS)[number], b: (typeof DECKS)[number]) => {
      for (let u = -1; u <= 1; u += 0.1) for (let v = -1; v <= 1; v += 0.1) {
        const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
        const x = a.x + u * a.hx * c + v * a.hz * s, z = a.z - u * a.hx * s + v * a.hz * c;
        const dx = x - b.x, dz = z - b.z, cb = Math.cos(b.yaw), sb = Math.sin(b.yaw);
        if (Math.abs(dx * cb - dz * sb) <= b.hx && Math.abs(dx * sb + dz * cb) <= b.hz) return true;
      }
      return false;
    };
    const seen = new Set([PLAZA]);
    for (let grew = true; grew;) {
      grew = false;
      for (const d of DECKS) if (!seen.has(d) && [...seen].some((o) => touches(d, o))) { seen.add(d); grew = true; }
    }
    expect(seen.size).toBe(DECKS.length);
    const end = CAUSEWAYS.town[CAUSEWAYS.town.length - 1], start = CAUSEWAYS.north[0];
    expect(onDeck(end[0], end[1], -0.2)).toBe(true);
    expect(onDeck(start[0], start[1], -0.2)).toBe(true);
    expect(Math.abs(DECK - (MERE_WATER + 0.8))).toBeLessThan(0.15);
  });

  it('stands on shallow water, inside the town\'s circle', () => {
    for (const d of DECKS) for (const [u, v] of [[0, 0], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9]]) {
      const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
      const x = d.x + u * d.hx * c + v * d.hz * s, z = d.z - u * d.hx * s + v * d.hz * c;
      expect(MERE_WATER - terrainHeight(x, z), `${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThan(DEEP_DEPTH);
      expect(Math.hypot(x - STILTWICK.x, z - STILTWICK.z)).toBeLessThan(STILTWICK.r + 8);
    }
  });

  it('keeps the houses apart', () => {
    for (let i = 0; i < HOUSES.length; i++) for (let k = i + 1; k < HOUSES.length; k++) {
      const a = houseFrame(HOUSES[i]), b = houseFrame(HOUSES[k]);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(14);
    }
  });
});
