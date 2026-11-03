import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Cragstalker } from '../game/cragstalker';
import { Overworld } from '../world/overworld';
import { beyondAt, CANYON_COURSE, CRAGSTALKERS_AT } from '../world/overworld/camp';
import { BEYOND, PASS } from '../world/overworld/layout';
import { BELLS } from './bells';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';

beforeAll(async () => {
  await initPhysics();
});

const stalkers = (f: { enemies: unknown[] }) => f.enemies.filter((e) => e instanceof Cragstalker);

function setup() {
  const physics = new Physics();
  const ow = new Overworld(physics);
  const content = overworldContent(ow);
  const f = fakeApi(ow, physics);
  const player = f.player as unknown as { pos: { set(x: number, y: number, z: number): void }; grounded: boolean; edgeAssist: boolean; invuln: number };
  player.grounded = true;
  return { ow, content, f, player, physics };
}

describe('the Cragstalkers and the crossing', () => {
  it('are two, on the far side only while the Northpass is built, standing on its ground', () => {
    const { ow, content, f } = setup();
    ow.streamAt(0, 60); // far from the pass: nothing built
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(0);
    ow.streamAt(PASS.camp.x, PASS.camp.z);
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(2);
    stalkers(f).forEach((c, i) => {
      const at = beyondAt(...CRAGSTALKERS_AT[i]);
      expect(Math.hypot(c.pos.x - at.x, c.pos.z - at.z)).toBeLessThan(0.5);
      expect(c.pos.y).toBeCloseTo(BEYOND.floor, 0);
    });
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(2); // not spawned twice
    ow.streamAt(0, 100); // out of range: the region drops
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(0);
  });

  it('each stays down once killed, until Wren dies', () => {
    const { ow, content, f } = setup();
    ow.streamAt(PASS.camp.x, PASS.camp.z);
    content.update!(f.api, 1 / 60);
    const c = stalkers(f)[0] as Cragstalker;
    c.alive = false;
    content.update!(f.api, 1 / 60);
    f.enemies.splice(f.enemies.indexOf(c), 1); // (the manager removes it once its death finishes)
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(1); // the other one is still there
    content.onRespawn!(f.api);
    content.update!(f.api, 1 / 60);
    expect(stalkers(f)).toHaveLength(2);
  });

  it('a fall in the crossing returns Wren to the last ledge and costs half a heart; the camp\'s lower ground is not a fall', async () => {
    const { ow, content, f, player } = setup();
    ow.streamAt(PASS.camp.x, PASS.camp.z);
    const start = CANYON_COURSE.platforms[0];
    player.pos.set(start.x, start.top, start.z);
    content.update!(f.api, 1 / 60);
    expect(f.queued).toHaveLength(0);
    expect(player.edgeAssist).toBe(true);
    // Lower than the fall line, but outside the canyon (the pass below the camp): no fall.
    player.pos.set(PASS.path[0][0], 2, PASS.path[0][1]);
    content.update!(f.api, 1 / 60);
    expect(f.queued).toHaveLength(0);
    const mid = beyondAt(31);
    player.grounded = false;
    player.pos.set(mid.x, BEYOND.floor - 4, mid.z);
    const hp = f.state.hp;
    content.update!(f.api, 1 / 60);
    expect(f.queued).toHaveLength(1);
    await f.runQueued();
    expect(f.state.hp).toBe(hp - 1);
  });
});

describe('the Waybell', () => {
  it('has its own post at the camp and an entrance in front of it', () => {
    const { ow } = setup();
    expect(BELLS.way.entrance).toBe('bell.way');
    expect(ow.bellPosts.get('way')).toBe(ow.wayPost);
    expect(ow.entrances['bell.way']).toBeDefined();
    expect(ow.interactables.map((i) => i.id)).toEqual(expect.arrayContaining(['bellPost.way', 'bellPickup.way', 'sign.canyon']));
  });

  it('taking and hanging it joins the network: ringing it offers the other two posts, and arriving rings the Waybell', async () => {
    const { ow, content, f, physics } = setup();
    ow.streamAt(PASS.camp.x, PASS.camp.z);
    physics.refreshQueries();
    f.state.bells.hung.add('morrow');
    f.state.bells.hung.add('lull');
    await content.scripts['bellPickup.way'](f.api);
    expect([...f.state.bells.carried]).toEqual(['way']);
    expect(ow.wayPost.canHang).toBe(true);
    expect(ow.wayBell.present).toBe(false);
    f.choices.push(null);
    const run = content.scripts['bellPost.way'](f.api);
    ow.wayPost.update(2);
    await run;
    expect([...f.state.bells.hung].sort()).toEqual(['lull', 'morrow', 'way']);
    expect(f.chosen.at(-1)!.options).toEqual(['Thistledown', 'Hall of Sleepers', 'Stay']);
  });
});
