import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Gravelheart } from '../game/bosses/gravelheart';
import { GameState } from '../game/state';
import { DungeonArea } from '../world/dungeon/build';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { fakeApi } from './fakeApi';
import { shrineContent } from './shrine';

beforeAll(async () => {
  await initPhysics();
});

/** The real shrine and its content in Node, with Wren standing wherever a test puts them. */
function setup(state = new GameState()) {
  const physics = new Physics();
  const area = new DungeonArea(physics, SHRINE);
  physics.refreshQueries();
  const content = shrineContent(area);
  const f = fakeApi(area, physics, state);
  state.area = 'shrine';
  content.restore(state);
  const rooms = new Map(SHRINE.rooms.map((r) => [r.id, r]));
  /** Puts Wren in the middle of a room. */
  const stand = (id: string) => {
    const r = rooms.get(id)!;
    f.player.pos.set(r.x + r.w / 2, r.floor * 8, r.z + r.d / 2);
  };
  return { area, content, ...f, stand, rooms, p: state.dungeon('shrine') };
}

describe('shrine content', () => {
  it('has a script for every interactable and trigger, and its signs read their text', async () => {
    const { area, content, api, said } = setup();
    for (const it of [...area.interactables, ...area.triggers]) expect(content.scripts[it.id], it.id).toBeTypeOf('function');
    await content.scripts.entrySign(api);
    expect(said[0].text).toMatch(/Sleep, stones/);
  });

  it('the entrance is an open doorway that never closes: the exit works from the start', async () => {
    const { area, content, api, queued, travels } = setup();
    content.start!(api);
    expect(queued.length).toBe(0); // no entry cutscene
    expect(area.triggers.find((t) => t.id === 'exit')!.enabled()).toBe(true);
    await content.scripts.exit(api);
    expect(travels).toEqual([{ area: 'overworld', entrance: 'shrineDoor' }]);
  });

  it('the first exit after the ward breaks is at noon, once', async () => {
    const state = new GameState();
    state.hours = 22;
    let s = setup(state);
    await s.content.scripts.exit(s.api);
    expect(state.hours).toBe(22); // ward intact: the clock is untouched
    state.set('valleyOpen');
    s = setup(state);
    await s.content.scripts.exit(s.api);
    expect(state.hours).toBe(12);
    state.hours = 22;
    await s.content.scripts.exit(s.api);
    expect(state.hours).toBe(22); // only the first time
  });

  it('each colored key opens only its own door, and is spent', async () => {
    const { area, content, api, p, said } = setup();
    await content.scripts.cryptPit(api);
    expect(area.doors.get('cryptPit')!.opening).toBe(false);
    expect(said.at(-1)!.text).toMatch(/Crimson Key/);
    p.cleared.add('southCell'); // pretend the fight is won, so its chest is there
    content.restore(api.state);
    await content.scripts.southChest(api);
    expect([...p.keys]).toEqual(['amber']);
    expect(said.at(-1)!.text).toMatch(/Amber Key/);
    expect(api.state.keys).toBe(0); // not a field key
    expect(api.state.dungeonKeysHere).toEqual(['amber']);
    await content.scripts.cryptPit(api); // the amber key doesn't fit the crimson door
    expect(area.doors.get('cryptPit')!.opening).toBe(false);
    expect(said.at(-1)!.text).toMatch(/Crimson Key/);
    await content.scripts.cryptCistern(api);
    expect(p.keys.size).toBe(0);
    expect(p.doors.has('cryptCistern')).toBe(true);
    expect(area.doors.get('cryptCistern')!.opening).toBe(true);
  });

  it('a save that opened a key chest but not its door still holds the key', () => {
    const { content, api, p } = setup();
    p.chests.add('loftChest');
    p.chests.add('rootChest');
    p.doors.add('emberGauntlet'); // azure already spent
    content.restore(api.state);
    expect([...p.keys]).toEqual(['crimson']);
  });


  it('the boss door wants the boss key; the glove chest gives the Tether Glove', async () => {
    const { area, content, api, p, toasts } = setup();
    await content.scripts.bossDoor(api);
    expect(area.doors.get('bossDoor')!.opening).toBe(false);
    p.bossKey = true;
    await content.scripts.bossDoor(api);
    expect(area.doors.get('bossDoor')!.opening).toBe(true);
    expect(p.bossKey).toBe(false); // spent on the door
    p.cleared.add('tetherRoom');
    content.restore(api.state);
    await content.scripts.tetherChest(api);
    expect(api.state.items.has('tether')).toBe(true);
    expect(toasts.filter((t) => t.includes('[item]'))).toHaveLength(1); // how to use it, once
  });

  it('a room is cleared, and its chest appears, once its enemies fall', async () => {
    const { area, content, api, enemies, runQueued, stand, p } = setup();
    content.start!(api);
    await runQueued();
    const chest = area.chests.get('southChest')!;
    const sigil = area.sigils.get('sigil.cell')!;
    stand('southCell');
    content.update!(api, 1 / 60);
    expect(chest.present).toBe(false);
    expect(sigil.present).toBe(false);
    // Beat the room's enemies (two sentinels and a thornling; stand-ins for now).
    const cell = enemies.filter((e) => e.pos.x > 14 && e.pos.x < 30 && e.pos.z > 16 && e.pos.z < 26);
    expect(cell.length).toBe(3);
    for (const e of cell) e.alive = false;
    content.update!(api, 1 / 60);
    await runQueued();
    expect(p.cleared.has('southCell')).toBe(true);
    expect(chest.present).toBe(true);
    expect(sigil.present).toBe(true); // its message is written in the air, and survives a reload
    const later = setup(api.state);
    later.content.restore!(later.api.state);
    expect(later.area.sigils.get('sigil.cell')!.present).toBe(true);
    expect(later.area.sigils.get('sigil.crypt')!.present).toBe(false);
  });

  it('striking the crystal raises the bars it holds, and that survives a reload', async () => {
    const { area, content, api, runQueued, p } = setup();
    content.start!(api);
    await runQueued();
    const crystal = area.switches.get('northBar')!.group.position;
    area.strike(crystal.x - 1.5, crystal.y, crystal.z, 1, 0, 2.4);
    await runQueued();
    expect(p.switches.has('northBar')).toBe(true);
    expect(area.doors.get('naveNorth')!.opening).toBe(true);
    const later = setup(api.state);
    expect(later.area.doors.get('naveNorth')!.open).toBe(true);
    expect(later.area.switches.get('northBar')!.pressed).toBe(true);
  });

  it('the nave\'s stone on its plate opens the stairwell door, for good', async () => {
    const { area, content, api, runQueued, p } = setup();
    content.start!(api);
    await runQueued();
    for (let k = 0; k < 3; k++) {
      area.moveStone('naveStone', { i: 1, j: 0 });
      area.update(1, {} as never);
    }
    await runQueued();
    expect(p.switches.has('navePlate')).toBe(true);
    expect(area.doors.get('naveEast')!.opening).toBe(true);
    const later = setup(api.state);
    expect(later.area.doors.get('naveEast')!.open).toBe(true);
    expect(later.area.switches.get('navePlate')!.pressed).toBe(true);
  });

  it('falling into a pit costs a heart and puts Wren back on the last solid floor', async () => {
    const { content, api, runQueued, rooms, player } = setup();
    content.start!(api);
    await runQueued();
    const pit = rooms.get('pitHall')!;
    const grounded = { value: true };
    Object.defineProperty(player, 'grounded', { get: () => grounded.value });
    const teleports: number[][] = [];
    (player as unknown as { teleport: (x: number, y: number, z: number) => void }).teleport = (x, y, z) => void teleports.push([x, y, z]);
    player.pos.set(pit.x + 7, -8, pit.z + 15); // solid floor south of the pit
    content.update!(api, 1 / 60);
    player.pos.set(pit.x + 7, -11, pit.z + 10); // at the bottom of the pit
    content.update!(api, 1 / 60);
    const hp = api.state.hp;
    await runQueued();
    expect(api.state.hp).toBe(hp - 2);
    expect(teleports[0][2]).toBeCloseTo(pit.z + 15);
  });

  it('does not remember ground hanging over a pit\'s lip: Wren comes back well clear of the water', async () => {
    const { content, api, runQueued, rooms, player } = setup();
    content.start!(api);
    await runQueued();
    const pit = rooms.get('pitHall')!;
    Object.defineProperty(player, 'grounded', { get: () => true });
    const teleports: number[][] = [];
    (player as unknown as { teleport: (x: number, y: number, z: number) => void }).teleport = (x, y, z) => void teleports.push([x, y, z]);
    player.pos.set(pit.x + 1, -8, pit.z + 10); // well back from the pit
    content.update!(api, 1 / 60);
    player.pos.set(pit.x + 3.9, -8, pit.z + 10); // right on the lip
    content.update!(api, 1 / 60);
    player.pos.set(pit.x + 4.3, -8, pit.z + 10); // 'grounded' while already over the edge
    content.update!(api, 1 / 60);
    player.pos.set(pit.x + 5, -11, pit.z + 10); // in the water
    content.update!(api, 1 / 60);
    await runQueued();
    expect(teleports[0][0]).toBeCloseTo(pit.x + 1);
  });

  it('walking up or down the stairwell\'s stairs is not a fall (halfway, the nearest floor is the other one)', async () => {
    const { content, api, runQueued, rooms, player, queued } = setup();
    content.start!(api);
    await runQueued();
    Object.defineProperty(player, 'grounded', { get: () => true });
    const well = rooms.get('stairwell')!;
    player.pos.set(well.x + 3, 0, well.z + 18); // on the stairwell floor, by the stairs
    content.update!(api, 1 / 60);
    // Climbing: past halfway (y > 4) on the up stairs, then down past halfway on the down stairs.
    for (const [x, y, z] of [[well.x + 2.5, 4.3, well.z + 9], [well.x + 2.5, 5.5, well.z + 7], [well.x + 7.5, -4.3, well.z + 9], [well.x + 7.5, -6, well.z + 7]]) {
      player.pos.set(x, y, z);
      content.update!(api, 1 / 60);
    }
    expect(queued.length).toBe(0);
    expect(api.state.hp).toBe(api.state.maxHp);
  });

  it('a moved stone stays put when Wren leaves the room, and goes back when Wren falls', async () => {
    const { area, content, api, runQueued, stand } = setup();
    content.start!(api);
    await runQueued();
    stand('nave');
    content.update!(api, 1 / 60);
    area.moveStone('naveStone', { i: 0, j: 1 });
    area.update(1, {} as never);
    stand('southCell');
    content.update!(api, 1 / 60);
    expect(area.stoneCell('naveStone')).toMatchObject({ i: 2, j: 6 }); // still where it was pushed
    content.onRespawn!(api);
    expect(area.stoneCell('naveStone')).toMatchObject({ i: 2, j: 5 });
  });

  it('the Gauntlet\'s sigil appears only once its six are beaten, and they stay beaten after death; the last sigil waits for the seal', async () => {
    const { area, content, api, enemies, runQueued, p } = setup();
    content.start!(api);
    await runQueued();
    const sigil = area.sigils.get('sigil.gauntlet')!;
    const inGauntlet = () => enemies.filter((e) => e.alive && area.roomAt(e.pos)?.id === 'gauntlet');
    expect(inGauntlet().length).toBe(6);
    expect(sigil.present).toBe(false);
    content.update!(api, 1 / 60);
    expect(sigil.present).toBe(false);
    for (const e of inGauntlet()) e.alive = false;
    content.update!(api, 1 / 60);
    await runQueued();
    expect(p.cleared.has('gauntlet')).toBe(true);
    expect(sigil.present).toBe(true);
    content.onRespawn!(api);
    expect(inGauntlet().length).toBe(0);
    // The message in the seal room waits for the seal to break.
    const last = area.sigils.get('sigil.seal')!;
    expect(last.present).toBe(false);
    p.switches.add('sealStone');
    const later = setup(api.state);
    later.content.restore!(later.api.state);
    expect(later.area.sigils.get('sigil.seal')!.present).toBe(true);
  });

  it('a beaten challenge room stays empty after death and on reload; its chest stays', async () => {
    const { area, content, api, enemies, runQueued, stand, p } = setup();
    content.start!(api);
    await runQueued();
    stand('southCell');
    const inCell = () => enemies.filter((e) => e.alive && e.pos.x > 14 && e.pos.x < 30 && e.pos.z > 16 && e.pos.z < 26);
    for (const e of inCell()) e.alive = false;
    content.update!(api, 1 / 60);
    await runQueued();
    expect(p.cleared.has('southCell')).toBe(true);
    content.onRespawn!(api);
    expect(inCell().length).toBe(0);
    expect(area.chests.get('southChest')!.present).toBe(true);
    // Elsewhere the enemies are back.
    expect(enemies.filter((e) => e.alive).length).toBeGreaterThan(0);
  });

  it('after a death, exactly the spawns outside beaten challenge rooms are alive', async () => {
    const { area, content, api, enemies, runQueued, p } = setup();
    content.start!(api);
    await runQueued();
    const challenge = new Set(
      SHRINE.things.flatMap((t) => ((t.kind === 'chest' || t.kind === 'sigil') && t.appears && 'cleared' in t.appears ? [t.appears.cleared] : [])),
    );
    for (const id of challenge) p.cleared.add(id);
    content.onRespawn!(api);
    const expected = area.spawns.filter((s) => s.type !== 'gravelheart' && !challenge.has(s.room)).length;
    expect(enemies.filter((e) => e.alive && !(e instanceof Gravelheart)).length).toBe(expected);
  });

  it('dying brings every enemy back (keys, chests and doors stay)', async () => {
    const { content, api, runQueued, enemies, p } = setup();
    content.start!(api);
    await runQueued();
    const all = enemies.length;
    for (const e of enemies.slice(0, 5)) e.alive = false;
    p.doors.add('cryptPit');
    content.onRespawn!(api);
    expect(enemies.length).toBe(all);
    expect(enemies.every((e) => e.alive)).toBe(true);
    expect(p.doors.has('cryptPit')).toBe(true);
  });

  it('the Hall of Plates opens only with both plates held down at once, then stays open', async () => {
    const { area, content, api, runQueued, p } = setup();
    content.start!(api);
    await runQueued();
    const step = async (id: string, i: number, j: number) => {
      area.moveStone(id, { i, j });
      area.update(1, {} as never);
      await runQueued();
    };
    // Stone A (cell 1,3) down a row to get under the pillar, then east to plate A (cell 6,4).
    await step('plateStoneA', 0, 1);
    for (let k = 0; k < 5; k++) await step('plateStoneA', 1, 0);
    expect(area.switches.get('plateA')!.pressed).toBe(true);
    expect(area.doors.get('platesCourt')!.opening).toBe(false); // one plate isn't enough
    // Slide it off again: the hold plate rises.
    await step('plateStoneA', 0, 1);
    expect(area.switches.get('plateA')!.pressed).toBe(false);
    await step('plateStoneA', 0, -1);
    // Stone B (cell 5,1) west to column 1, then down to plate B (cell 1,5).
    for (let k = 0; k < 4; k++) await step('plateStoneB', -1, 0);
    for (let k = 0; k < 4; k++) await step('plateStoneB', 0, 1);
    expect(p.switches.has('plateA') && p.switches.has('plateB')).toBe(true);
    expect(area.doors.get('platesCourt')!.opening).toBe(true);
    // Latched: moving a stone off now changes nothing.
    await step('plateStoneB', 0, -1);
    expect(area.switches.get('plateB')!.pressed).toBe(true);
  });

  it('a flask chest adds a full flask; a stone bounced off a wall shoves Wren back', async () => {
    const { area, content, api, runQueued, pushes } = setup();
    content.start!(api);
    await runQueued();
    await content.scripts.courtFlaskChest(api);
    expect(api.state.flasks.slots).toEqual(['life']);
    // The doorway stone, pushed north to the wall, then struck against it.
    const st = () => area.stones.get('entryStone')!.group.position;
    for (let k = 0; k < 4; k++) {
      area.update(1, {} as never);
      area.strike(st().x, 0, st().z + 1.8, 0, -1, 2.4);
    }
    expect(pushes.length).toBe(1); // three cells to the wall, the fourth strike bounces
  });

  it('restores opened doors and chests, and the exit still works after the keeper is beaten', async () => {
    const state = new GameState();
    const p = state.dungeon('shrine');
    p.doors.add('tetherDoor');
    p.chests.add('courtFlaskChest');
    let s = setup(state);
    expect(s.area.doors.get('tetherDoor')!.open).toBe(true);
    expect(s.area.chests.get('courtFlaskChest')!.opened).toBe(true);
    p.done = true;
    s = setup(state);
    await s.content.scripts.exit(s.api);
    expect(s.travels).toEqual([{ area: 'overworld', entrance: 'shrineDoor' }]);
  });

  it('beating Gravelheart opens the way: the ember leaves, a Heart Vessel appears, the hidden door opens', async () => {
    const s = setup();
    s.content.start!(s.api);
    const boss = s.enemies.find((e) => e instanceof Gravelheart) as Gravelheart;
    boss.asleep = true;
    boss.onDefeated!();
    await s.runQueued();
    expect(s.p.done).toBe(true);
    expect(s.p.cleared.has('boss')).toBe(true);
    expect(s.p.doors.has('sealDoor')).toBe(true);
    expect(s.area.doors.get('sealDoor')!.opening).toBe(true);
    expect(s.area.hearth!.vessel.visible).toBe(true);
    expect(s.toasts.at(-1)).toMatch(/north wall/);
    // The vessel adds a heart (two half-hearts) once, and a reload doesn't bring it back.
    await s.content.scripts['trigger.heartVessel'](s.api);
    expect(s.state.maxHp).toBe(8);
    expect(s.state.has('gravelheartVessel')).toBe(true);
    expect(s.area.hearth!.vessel.visible).toBe(false);
    const again = setup(s.state);
    expect(again.area.hearth!.vessel.visible).toBe(false);
    expect(again.area.hearth!.causewayUp).toBe(true);
    expect(again.area.doors.get('sealDoor')!.open).toBe(true);
  });

  it('a save that was beaten but left the vessel behind shows it again', () => {
    const state = new GameState();
    state.dungeon('shrine').done = true;
    expect(setup(state).area.hearth!.vessel.visible).toBe(true);
  });

  it('the seal-stone shows the gate breaking and returns to the seal room, saving the press only at the end', async () => {
    const s = setup();
    s.content.start!(s.api);
    let opened = false;
    const gate = { center: new THREE.Vector3(8, 4, -121), open: () => (opened = true), settled: true };
    (s.api as { area: unknown }).area = { gate };
    s.area.onSwitch!('sealStone');
    expect(s.p.switches.has('sealStone')).toBe(false);
    await s.runQueued();
    expect(opened).toBe(true);
    expect(s.state.has('valleyOpen')).toBe(true);
    expect(s.p.switches.has('sealStone')).toBe(true);
    expect(s.travels).toEqual([{ area: 'overworld', entrance: 'gateView' }, { area: 'shrine', entrance: 'sealStone.beyond' }]);
    expect(s.hidden).toEqual([true, false]); // the vision is of a place Wren isn't standing in
  });
});
