import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../../core/physics';
import { DungeonArea } from './build';
import { SHRINE } from './defs/shrine';
import { PRISM_COOLDOWN, PRISM_HITS } from './prism';

beforeAll(async () => {
  await initPhysics();
});

function setup() {
  const area = new DungeonArea(new Physics(), SHRINE);
  const sw = area.switches.get('sealStone')!;
  const hits: number[] = [];
  let pressed = 0;
  area.onPrismHit = (n) => hits.push(n);
  area.onSwitch = () => pressed++;
  const c = sw.group.position;
  /** One sword swing from the south, close enough to reach it, then time passes. */
  const swing = (wait = PRISM_COOLDOWN + 0.05) => {
    area.strike(c.x, c.y, c.z + 1.9, 0, -1, 2);
    sw.update(wait);
  };
  return { area, sw, hits, swing, pressed: () => pressed };
}

describe('the seal prism', () => {
  it('takes four hits (one per beam): the first three only crack it, the fourth shatters it and presses the switch', () => {
    const { sw, hits, swing, pressed } = setup();
    expect(PRISM_HITS).toBe(4);
    swing();
    swing();
    swing();
    expect(hits).toEqual([1, 2, 3]);
    expect(pressed()).toBe(0);
    expect(sw.pressed).toBe(false);
    swing();
    expect(hits).toEqual([1, 2, 3, 4]);
    expect(pressed()).toBe(1);
    expect(sw.pressed && sw.prism!.shattered).toBe(true);
    swing(); // nothing left to hit
    expect(hits.length).toBe(4);
    expect(pressed()).toBe(1);
  });

  it('a second strike inside the cooldown (one swing reaching twice) counts once', () => {
    const { hits, swing } = setup();
    swing(0.1);
    swing(0.1);
    expect(hits).toEqual([1]);
  });

  it('arrives beyond the prism, farther from the door than the prism is', () => {
    const { area, sw } = setup();
    const e = area.entrances['sealStone.beyond'];
    const door = area.entrances.sealRoom;
    expect(Math.hypot(e.x - door.x, e.z - door.z)).toBeGreaterThan(Math.hypot(sw.group.position.x - door.x, sw.group.position.z - door.z));
  });

  it('does not count a strike from out of reach', () => {
    const { area, sw, hits } = setup();
    const c = sw.group.position;
    area.strike(c.x, c.y, c.z + 9, 0, -1, 2);
    expect(hits).toEqual([]);
  });

  it('snaps one beam per hit, the last one on the shatter; a saved shatter restores with none', () => {
    const { sw, swing } = setup();
    const live = (g = sw) => g.group.children.filter((o) => o instanceof THREE.Mesh && (o.material as THREE.Material).type === 'MeshBasicMaterial' && o.visible && (o.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry').length;
    expect(live()).toBe(4);
    swing(1);
    expect(live()).toBe(3);
    swing(1);
    expect(live()).toBe(2);
    swing(1);
    expect(live()).toBe(1);
    swing(1);
    expect(live()).toBe(0);
    const again = setup();
    again.sw.setPressed(true);
    expect(again.sw.prism!.shattered).toBe(true);
    again.sw.update(0.1);
    expect(live(again.sw)).toBe(0);
  });
});
