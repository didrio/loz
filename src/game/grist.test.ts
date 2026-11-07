import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/math';
import { initPhysics } from '../core/physics';
import type { HitResult } from './enemies';
import { enemyEnv, flatGround, runEnemy } from './enemyTestEnv';
import { GRIST_ATTACKS, GRIST_DAZED, GRIST_HP, GRIST_TIMING, Grist, inBlow, pickMove, type GristMove } from './grist';

beforeAll(async () => {
  await initPhysics();
});

function setup(wren: THREE.Vector3, hostile = false, result?: () => HitResult) {
  const physics = flatGround();
  const g = new Grist(new THREE.Group(), physics, 0, 0, 400, hostile);
  g.rng = mulberry32(3);
  g.faceAngle(0);
  const { env, hits } = enemyEnv(physics, wren, result);
  return { g, hits, env, run: (sec: number, until?: () => boolean) => runEnemy(g, physics, env, sec, until) };
}

describe('Grist: the NPC', () => {
  it('peaceable: never attacks, lock-on skips him; he moves in his own dialog, not in other cutscenes', () => {
    const { g, hits, run } = setup(new THREE.Vector3(0, 0, 2.5));
    run(6);
    expect(hits).toHaveLength(0);
    expect(g.targetable).toBe(false);
    expect(g.animatesInCutscene()).toBe(false); // a travel's fade: frozen like any enemy
    g.beginTalk();
    expect(g.animatesInCutscene()).toBe(true);
  });

  it('talking then offended: after a beat, he fights', () => {
    const { g, hits, run } = setup(new THREE.Vector3(0, 0, 2.5));
    g.beginTalk();
    run(3);
    expect(hits).toHaveLength(0);
    g.endTalk(true);
    expect(g.hostile).toBe(true);
    expect(run(8, () => hits.length > 0)).toBe(true);
  });

  it('talking then parted on good terms: back to wandering', () => {
    const { g, hits, run } = setup(new THREE.Vector3(0, 0, 2.5));
    g.beginTalk();
    g.endTalk(false);
    run(5);
    expect(g.peaceful).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it('a sword hit while he is peaceable provokes him (once), and it counts', () => {
    const { g } = setup(new THREE.Vector3(0, 0, 2));
    let provoked = 0;
    g.onProvoked = () => provoked++;
    expect(g.hurt(1, new THREE.Vector3(0, 0, 2))).toBe('hit');
    g.hurt(1, new THREE.Vector3(0, 0, 2));
    expect(provoked).toBe(1);
    expect(g.hostile).toBe(true);
    expect(g.hp).toBe(GRIST_HP - 2);
  });
});

describe('Grist: the fight', () => {
  it('every move has a tell of at least half a second, and ends after its blow (the opening)', () => {
    for (const m of Object.keys(GRIST_TIMING) as GristMove[]) {
      const t = GRIST_TIMING[m];
      expect(t.impact).toBeGreaterThanOrEqual(0.5);
      expect(t.end - (t.impact + t.active)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('the guard-crushing haymaker has the longest tell', () => {
    expect(GRIST_ATTACKS.haymaker.guard).toBe(3);
    expect(GRIST_TIMING.haymaker.impact).toBeGreaterThan(Math.max(GRIST_TIMING.jab.impact, GRIST_TIMING.sweep.impact));
  });

  it('lands a blow from his sheet, no earlier than its tell', () => {
    const { g, hits, run } = setup(new THREE.Vector3(0, 0, 2.2), true);
    let winding = 0;
    run(10, () => {
      if (g.winding) winding += 1 / 60;
      return hits.length > 0;
    });
    expect(hits.length).toBe(1);
    expect(Object.values(GRIST_ATTACKS)).toContain(hits[0].attack);
    expect(winding + 1 / 60).toBeGreaterThanOrEqual(0.5 - 0.02);
  });

  it('a blocked blow leaves him dazed: no new blow for a good while', () => {
    const { hits, run } = setup(new THREE.Vector3(0, 0, 2.2), true, () => 'blocked');
    run(10, () => hits.length > 0);
    run(GRIST_DAZED + 0.4 - 0.05);
    expect(hits).toHaveLength(1);
  });

  it('stepping out of reach during the tell dodges the blow', () => {
    const wren = new THREE.Vector3(0, 0, 2.2);
    const { g, hits, run } = setup(wren, true);
    run(10, () => g.winding);
    wren.set(0, 0, 9);
    run(0.9);
    expect(hits).toHaveLength(0);
  });

  it('falls to GRIST_HP hits and tells content once', () => {
    const { g, run } = setup(new THREE.Vector3(0, 0, 2), true);
    let down = 0;
    g.onDefeated = () => down++;
    for (let i = 0; i < GRIST_HP; i++) g.hurt(1, new THREE.Vector3(0, 0, 2));
    expect(g.alive).toBe(false);
    expect(run(3, () => g.gone)).toBe(true);
    expect(down).toBe(1);
  });
});

describe('pickMove / inBlow', () => {
  it('closes in when out of reach', () => {
    expect(pickMove(6, 0, null, 0.1)).toBeNull();
  });
  it('mostly jabs up close, mostly haymakers at arm\'s length', () => {
    expect(pickMove(2, 0, null, 0.1)).toBe('jab');
    expect(pickMove(3.2, 0, null, 0.1)).toBe('haymaker');
  });
  it('sweeps when Wren circles to his side', () => {
    expect(pickMove(2.5, 1.2, null, 0.1)).toBe('sweep');
  });
  it('never haymakers twice running', () => {
    expect(pickMove(3.2, 0, 'haymaker', 0.1)).not.toBe('haymaker');
  });
  it('the sweep covers his sides; the jab only his front', () => {
    expect(inBlow('sweep', 3, 1.4)).toBe(true);
    expect(inBlow('jab', 2, 1.4)).toBe(false);
  });
});
