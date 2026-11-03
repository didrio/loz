import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Layer, Physics } from '../../core/physics';
import { NO_CONTROLS, Player, type PlayerEnv } from '../../game/player';
import type { Area } from '../area';
import { DungeonArea, subtractRects } from './build';
import { SHRINE } from './defs/shrine';
import { DROP_SIZE, PIT_DEPTH, stairPlacement, type DungeonDef } from './format';

beforeAll(async () => {
  await initPhysics();
});

/** The shrine built in Node, with a Wren who can walk around it. */
function setup() {
  const physics = new Physics();
  const area = new DungeonArea(physics, SHRINE);
  physics.refreshQueries();
  const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
  const env = {
    area: { waterLevel: null, cut: () => [] } as unknown as Area,
    lockTarget: null, enemies: [], hasSword: false,
    onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
  } satisfies PlayerEnv;
  /** Walks in a direction for `seconds` (world space, +x east, +z south). */
  const walk = (dx: number, dz: number, seconds: number) => {
    const move = new THREE.Vector3(dx, 0, dz).normalize();
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.update(1 / 60, { ...NO_CONTROLS, move }, env);
      physics.step(1 / 60);
    }
  };
  const ground = (x: number, z: number, fromY: number) => physics.groundY(x, z, fromY, Layer.World);
  const rooms = new Map(SHRINE.rooms.map((r) => [r.id, r]));
  return { physics, area, p, walk, ground, rooms };
}

describe('subtractRects', () => {
  it('covers a rectangle except its holes, exactly', () => {
    const base = { x: 0, z: 0, w: 10, d: 10 };
    const parts = subtractRects(base, [{ x: 2, z: 2, w: 3, d: 3 }, { x: 8, z: 0, w: 2, d: 10 }]);
    expect(parts.reduce((s, r) => s + r.w * r.d, 0)).toBeCloseTo(100 - 9 - 20);
    for (const r of parts) expect(r.x < 5 && r.x + r.w > 2 && r.z < 5 && r.z + r.d > 2).toBe(false);
  });
});

describe('the built shrine', () => {
  it('puts every room\'s floor at its level, under its ceiling', () => {
    const { area, ground } = setup();
    for (const r of SHRINE.rooms) {
      // A spot in the room clear of stairs, holes and pits: its northwest corner area.
      const y = ground(r.x + 1.2, r.z + 1.2, r.floor * 8 + 3);
      expect(y, r.id).toBeCloseTo(r.floor * 8, 1);
    }
    expect(area.spawn.y).toBeCloseTo(0.05);
    expect(area.indoor).toBe(true);
  });

  it('has pits with a floor, and a drop hole that opens onto the room below', () => {
    const { ground, rooms } = setup();
    const pit = rooms.get('pitHall')!;
    expect(ground(pit.x + 8, pit.z + 10, -8 + 1)).toBeCloseTo(-8 - PIT_DEPTH, 1);
    const loft = rooms.get('loft')!, nave = rooms.get('nave')!;
    // The drop hole is centered where the loft overlaps the nave below.
    const cx = (Math.max(loft.x, nave.x) + Math.min(loft.x + loft.w, nave.x + nave.w)) / 2;
    const cz = (Math.max(loft.z, nave.z) + Math.min(loft.z + loft.d, nave.z + nave.d)) / 2;
    expect(ground(cx, cz, 8 + 1)).toBeCloseTo(0, 1);
    expect(ground(cx + DROP_SIZE, cz, 8 + 1)).toBeCloseTo(8, 1); // just beside it: loft floor
  });

  it('lets Wren climb the stairs from the stairwell up to the gallery, and down to the crypt', () => {
    const { p, walk, rooms } = setup();
    const up = stairPlacement(SHRINE.doors.find((d) => d.id === 'stairsUp')!, rooms.get('stairwell')!, rooms.get('gallery')!)!;
    p.teleport(up.foot[0], 0.05, up.foot[1] + 1, Math.PI);
    walk(0, -1, 3.5); // climb north
    expect(p.pos.y).toBeCloseTo(8, 0);
    const down = stairPlacement(SHRINE.doors.find((d) => d.id === 'stairsDown')!, rooms.get('stairwell')!, rooms.get('crypt')!)!;
    // Down stairs climb south, so their top is at the south end: start just past it, walk north.
    p.teleport(down.foot[0], 0.05, down.foot[1] + 12 + 0.8, Math.PI);
    walk(0, -1, 3.5);
    expect(p.pos.y).toBeCloseTo(-8, 0);
  });

  it('leaves a clear landing at the top of the Deep Shaft stairs (no statue to squeeze past)', () => {
    const { p, walk, rooms } = setup();
    const s = stairPlacement(SHRINE.doors.find((d) => d.id === 'shaftUp')!, rooms.get('deepShaft')!, rooms.get('northCell')!)!;
    expect(s.up).toBe('n');
    const topZ = s.foot[1] - 12;
    p.teleport(s.foot[0], -8 + 0.05, s.foot[1] + 1, Math.PI);
    walk(0, -1, 6); // up the flight and on, straight ahead
    expect(p.pos.y).toBeCloseTo(0, 0);
    expect(p.pos.z).toBeLessThan(topZ - 1.2); // well past the top step, not wedged against something
  });

  it('lets Wren through an open doorway but not a locked door', () => {
    const { p, walk, area, rooms } = setup();
    // From the nave south into the sentinel cell, through an open doorway.
    const cell = rooms.get('southCell')!;
    p.teleport(cell.x + cell.w / 2, 0.05, cell.z - 3, 0);
    walk(0, 1, 2);
    expect(p.pos.z).toBeGreaterThan(cell.z + 1);
    // The nave's east door (near its south end) is barred until its plate is pressed.
    const nave = rooms.get('nave')!;
    p.teleport(nave.x + nave.w - 2, 0.05, nave.z + 18, Math.PI / 2);
    walk(1, 0, 2);
    expect(p.pos.x).toBeLessThan(nave.x + nave.w);
    area.doors.get('naveEast')!.setOpen();
    walk(1, 0, 2);
    expect(p.pos.x).toBeGreaterThan(nave.x + nave.w + 1);
  });

  it('places doors, chests (hidden until they appear), switches, stones and spawns from the data', () => {
    const { area } = setup();
    expect([...area.doors.keys()].sort()).toEqual(SHRINE.doors.filter((d) => !d.kind || d.kind === 'door').map((d) => d.id).sort());
    expect(area.chests.get('southChest')!.present).toBe(false); // appears when the cell is cleared
    expect(area.chests.get('courtFlaskChest')!.present).toBe(true);
    expect(area.switches.get('navePlate')!.style).toBe('plate');
    expect(area.stones.get('loftStone')!.heavy).toBe(true);
    expect(area.spawns.find((s) => s.id === 'gravelheart')!.type).toBe('gravelheart');
    // Signs, chests, and every door with a lock (small, boss, bars) can be interacted with.
    const ids = area.interactables.map((i) => i.id);
    for (const id of ['anteSign', 'entrySign', 'courtFlaskChest', 'southChest', 'tetherDoor', 'cryptPit', 'bossDoor', 'naveEast']) expect(ids, id).toContain(id);
    expect(ids).not.toContain('entryNave'); // an open doorway
    expect(area.triggers.map((t) => t.id)).toEqual(['exit']);
  });

  it('wakestones: the sword pushes one cell, things in the way stop it, heavy ones don\'t budge', () => {
    const { area } = setup();
    const results: string[] = [];
    area.onStone = (_id, r) => results.push(r);
    // The doorway stone (entry cell 6,3): strike it from the south and it slides north, clearing the doorway.
    const st = area.stones.get('entryStone')!.group.position;
    area.strike(st.x, 0, st.z + 1.8, 0, -1, 2.4);
    expect(area.stoneCell('entryStone')).toMatchObject({ i: 6, j: 2 });
    // Keep pushing north to the wall; struck against the wall, it bounces back a cell.
    const strikeNorth = () => {
      area.update(1, {} as never);
      area.strike(st.x, 0, area.stones.get('entryStone')!.group.position.z + 1.8, 0, -1, 2.4);
    };
    strikeNorth(); strikeNorth();
    expect(area.stoneCell('entryStone').j).toBe(0);
    strikeNorth();
    expect(results.at(-1)).toBe('bounced');
    expect(area.stoneCell('entryStone').j).toBe(1);
    // Wren standing in the way blocks a push.
    expect(area.moveStone('naveStone', { i: 1, j: 0 }, new THREE.Vector3(14 + 7, 0, -4 + 11))).toBe('blocked');
    // Heavy stones only thunk under the sword.
    const heavy = area.stones.get('loftStone')!.group.position;
    area.strike(heavy.x - 1.8, 8, heavy.z, 1, 0, 2.4);
    expect(results.at(-1)).toBe('heavy');
    expect(area.stoneCell('loftStone')).toMatchObject({ i: 1, j: 4 });
  });

  it('a stone pushed onto the nave\'s plate presses it', () => {
    const { area } = setup();
    const pressed: string[] = [];
    area.onSwitch = (id) => pressed.push(id);
    for (let k = 0; k < 3; k++) {
      expect(area.moveStone('naveStone', { i: 1, j: 0 })).toBe('moved');
      area.update(1, {} as never);
    }
    expect(pressed).toEqual(['navePlate']);
    expect(area.switches.get('navePlate')!.pressed).toBe(true);
  });

  it('a stone in a pit fills it (Wren can walk over), and room resets leave it there', () => {
    const { area, ground, rooms, physics } = setup();
    const cis = rooms.get('cistern')!;
    expect(area.moveStone('cisternStone', { i: 0, j: 1 })).toBe('moved');
    area.update(1, {} as never);
    expect(area.moveStone('cisternStone', { i: 0, j: 1 })).toBe('sunk');
    area.update(1, {} as never);
    const [x, z] = [cis.x + 5, cis.z + 7];
    physics.refreshQueries(); // ray queries see moved colliders after a step (the game steps every frame)
    // Stones are Prop-layer (the camera passes through them), which Wren walks on.
    expect(physics.groundY(x, z, -8 + 1)).toBeCloseTo(-8, 1);
    expect(ground(x + 4, z, -8 + 1)).toBeCloseTo(-11, 1); // the rest of the channel is still open
    area.resetRoom('cistern');
    expect(area.stoneCell('cisternStone')).toMatchObject({ i: 2, sunk: true });
    // A stone that was merely moved goes home on reset.
    area.moveStone('naveStone', { i: 0, j: 1 });
    area.resetRoom('nave');
    expect(area.stoneCell('naveStone')).toMatchObject({ i: 2, j: 5 });
  });

  it('the Tether Glove pulls a stone one cell toward Wren, heavy ones too, only in line and in range', () => {
    const { area, rooms } = setup();
    const loft = rooms.get('loft')!;
    const stone = area.stones.get('loftStone')!.group.position;
    // Wren east of the heavy stone, in its row, 8 m off: it comes one cell closer.
    const wx = stone.x + 8;
    expect(area.tether(wx, 8, stone.z, -1, 0)?.result).toBe('moved');
    expect(area.stoneCell('loftStone')).toMatchObject({ i: 2, j: 4 });
    area.update(1, {} as never);
    // Out of its row (off to one side), the cord catches but nothing moves.
    expect(area.tether(wx, 8, stone.z + 3, -0.94, -0.34)?.result).toBe('blocked');
    expect(area.stoneCell('loftStone')).toMatchObject({ i: 2, j: 4 });
    // Too far away, or aimed elsewhere: a miss.
    expect(area.tether(stone.x + 14, 8, stone.z, -1, 0)).toBeNull();
    // Facing away, it still finds the stone Wren stands in line with (aim assist)...
    expect(area.tether(wx, 8, stone.z, 1, 0)?.result).toBe('moved');
    area.update(1, {} as never);
    // ...but not one off to the side.
    expect(area.tether(wx, 8, stone.z + 5, 0, 1)).toBeNull();
    // Pulled all the way onto its plate, the plate presses (the loft's key).
    const pressed: string[] = [];
    area.onSwitch = (id) => pressed.push(id);
    // Wren backs off as it comes, keeping two cells away (but never past the room's east end).
    for (let k = 0; k < 8 && !pressed.length; k++) {
      area.tether(Math.min(stone.x + 4, loft.x + loft.w - 1), 8, stone.z, -1, 0);
      area.update(1, {} as never);
    }
    expect(pressed).toEqual(['loftPlate']);
  });

  it('a fallen column swings across the Pit Hall\'s pit when pulled from the near side, and Wren can cross', () => {
    const { area, rooms, physics, p, walk } = setup();
    const pit = rooms.get('pitHall')!;
    const col = area.columns.get('bridgeStone')!;
    const row = col.z;
    expect(physics.groundY(pit.x + 8, row, -8 + 1, Layer.World)).toBeCloseTo(-11, 1); // open pit
    // From the far (west) side it won't budge: it swings toward whoever pulls from across the pit.
    expect(area.tether(pit.x + 2, -8, row + 2, 0, 1)).toBeNull();
    const at = area.tether(pit.x + 14, -8, row, -1, 0);
    expect(at?.result).toBe('bridged');
    for (let k = 0; k < 3; k++) area.update(1, {} as never);
    physics.refreshQueries();
    expect(physics.groundY(pit.x + 8, row, -8 + 1, Layer.World)).toBeCloseTo(-8, 1);
    // Wren walks across it, west, from the near ledge to the far one.
    p.teleport(pit.x + 14, -8 + 0.05, row, -Math.PI / 2);
    walk(-1, 0, 2);
    expect(p.pos.x).toBeLessThan(pit.x + 4);
    expect(p.pos.y).toBeGreaterThan(-8.5);
  });

  it('removes all of its colliders when disposed', () => {
    const physics = new Physics();
    const area = new DungeonArea(physics, SHRINE);
    expect(physics.world.colliders.len()).toBeGreaterThan(100);
    area.dispose();
    expect(physics.world.colliders.len()).toBe(0);
  });
});

describe('trial room platforms', () => {
  const def: DungeonDef = {
    id: 't', name: 't', goal: 'b', entrance: { room: 'a', at: [3, 12], facing: 'n' },
    rooms: [
      { id: 'a', floor: 0, x: 0, z: 0, w: 20, d: 14, trial: true, height: 8, platforms: [
        { x: 5, z: 4, w: 3, d: 3, top: 1.5 },
        { x: 12, z: 4, w: 3, d: 3, top: 1.5, move: { by: [0, 2, 0], period: 4, phase: 0 } },
      ] },
      { id: 'b', floor: 0, x: 20, z: 0, w: 14, d: 14 },
    ],
    doors: [{ id: 'ab', from: 'a', to: 'b' }],
    things: [],
  };

  it('builds solid ledges, moves the sliding one, and removes its collider on dispose', () => {
    const physics = new Physics();
    const area = new DungeonArea(physics, def);
    physics.refreshQueries();
    const top = (x: number, z: number) => physics.groundY(x, z, 7, Layer.World | Layer.Prop);
    expect(top(5, 4)).toBeCloseTo(1.5, 1);
    expect(top(12, 4)).toBeCloseTo(1.5, 1); // phase 0: resting
    for (let i = 0; i < 120; i++) { // 2 s = half a period: fully risen
      area.update(1 / 60, {} as never);
      physics.step(1 / 60);
    }
    expect(top(12, 4)).toBeCloseTo(3.5, 1);
    expect(area.trialRoomAt(new THREE.Vector3(5, 0, 5))?.id).toBe('a');
    expect(area.trialRoomAt(new THREE.Vector3(25, 0, 5))).toBeNull();
    area.dispose();
    physics.refreshQueries();
    expect(top(12, 4)).toBeNull();
  });
});
