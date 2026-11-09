import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../../core/physics';
import { ceilingBeams, cornice, floorTiles, roomCornice, SHELL, SHELL_DEFAULTS } from '../../render/models/shrine';
import { DOOR_DEFAULTS, doorFrameGeometry } from '../../render/models/shrineProps';
import { AreaBuilder } from '../area';
import { WALL_T } from './build';
import { CEIL_T, DEFAULT_DOOR_WIDTH, DEFAULT_ROOM_HEIGHT, DOOR_HEIGHT, FLOOR_T } from './format';
import { CELL } from './grid';
import { Wakestone } from './pieces';

beforeAll(async () => {
  await initPhysics();
});

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

/** The final shrine shell and doorway frame (T56a; render/models/shrine.ts, shrineProps.ts) against the dungeon's rules. */
describe('the shrine shell fits the dungeon', () => {
  it("uses the dungeon's own measures (render can't import world, so these are copies)", () => {
    expect(SHELL_DEFAULTS).toEqual({ wallT: WALL_T, floorT: FLOOR_T, roomHeight: DEFAULT_ROOM_HEIGHT, cell: CELL });
    expect(DOOR_DEFAULTS).toEqual({ width: DEFAULT_DOOR_WIDTH, height: DOOR_HEIGHT });
    expect(CEIL_T).toBeGreaterThan(0);
  });

  it('never reaches a wakestone: below the course nothing stands prouder than a stone at a wall already overlaps it', () => {
    const b = new AreaBuilder(new Physics(), () => 0.5);
    const light = new Wakestone(b, new THREE.Group(), 'l', 0, 0, 0, false), heavy = new Wakestone(b, new THREE.Group(), 'h', 0, 0, 0, true);
    // A stone in a cell against a wall: its centre is half a cell from the wall's line, so it reaches into the wall by this.
    const overlap = WALL_T / 2 - (CELL / 2 - light.size / 2);
    expect(SHELL.pierOut).toBeLessThan(overlap);
    expect((WALL_T + 0.12) / 2 - WALL_T / 2).toBeLessThan(overlap); // the plinth
    // The course and everything above it clear the taller (heavy) stone.
    expect(SHELL.courseY - SHELL.courseH / 2).toBeGreaterThan(heavy.size + 0.3);
  });

  it("lays the flags with their tops at the floor's height, on the stones' grid, clipped to the piece", () => {
    const g = floorTiles({ x: 1, z: 0, w: 5, d: 4 }, { x: 0, z: 0 }, 8, 0x8b8476)!;
    const bb = box(g);
    expect(bb.max.y).toBeCloseTo(8, 6);
    expect(bb.min.y).toBeGreaterThan(8 - SHELL.tileT - 0.01);
    expect(bb.min.x).toBeGreaterThanOrEqual(1);
    expect(bb.max.x).toBeLessThanOrEqual(6);
    // Only faces that look up: nobody sees a flag's sides or bottom.
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.2);
    // Cells x 1–2 (clipped), 2–4, 4–6 by z 0–2, 2–4: six flags of 14 triangles.
    expect(g.attributes.position.count / 3).toBe(6 * 14);
  });

  it("keeps a room's corners clean: the x walls' cornice runs into the corner, the z walls' stops at it", () => {
    const r = { x: 0, z: 0, w: 10, d: 8 };
    const x = box(cornice('x', 0, 1, WALL_T / 2, 10 - WALL_T / 2, 7, 0x5f5a50));
    const z = box(cornice('z', 0, 1, WALL_T / 2, 8 - WALL_T / 2, 7, 0x5f5a50, WALL_T, true));
    // Each z step starts where the x wall's same step ends: the lower butts the lower, the upper the upper.
    expect(x.max.z).toBeCloseTo(WALL_T / 2 + SHELL.corniceOut, 6);
    expect(z.min.z).toBeCloseTo(WALL_T / 2 + SHELL.corniceOut * 0.55, 6);
    const all = box(roomCornice(r, 7, 0x5f5a50));
    expect(all.max.y).toBeCloseTo(7, 6);
  });

  it('leaves out a ceiling beam that would cross a hole in the ceiling', () => {
    const r = { x: 0, z: 0, w: 8, d: 16 };
    const all = ceilingBeams(r, 7, 0x5f5a50, [])!;
    const holed = ceilingBeams(r, 7, 0x5f5a50, [{ x: 2, z: 7, w: 2, d: 2 }])!;
    expect(holed.attributes.position.count).toBeLessThan(all.attributes.position.count);
    expect(box(all).max.y).toBeCloseTo(7, 6);
  });

  it("keeps a doorway's opening clear (frame only round it, as the rough's posts and lintel were)", () => {
    const g = doorFrameGeometry(DEFAULT_DOOR_WIDTH, DOOR_HEIGHT, 0x5f5a50);
    const pos = g.attributes.position;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const inside = Math.abs(cx) < DEFAULT_DOOR_WIDTH / 2 - 0.02 && cy < DOOR_HEIGHT - 0.02;
      expect(inside).toBe(false);
    }
  });
});
