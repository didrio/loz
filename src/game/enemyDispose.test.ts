import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import { isSharedMaterial } from '../render/materials';
import { Cragstalker } from './cragstalker';
import { Gloomwisp, Thornling, type Enemy } from './enemies';
import { flatGround } from './enemyTestEnv';
import { DozingSentinel } from './sentinel';
import { Shellback } from './shellback';

beforeAll(async () => {
  await initPhysics();
});

/**
 * The checkpoint rule rebuilds every enemy in the dungeon on each death. Removing one must
 * free all of its GPU resources: before this test, `dispose` freed only the flash materials,
 * so each death in the shrine leaked ~150-200 geometries (renderer.info.memory.geometries
 * climbed by that much per death and never came back).
 */
describe('Enemy.dispose', () => {
  const makers: [string, (parent: THREE.Object3D, physics: ReturnType<typeof flatGround>) => Enemy][] = [
    ['thornling', (p, ph) => new Thornling(p, ph, 0, 0)],
    ['sentinel', (p, ph) => new DozingSentinel(p, ph, 0, 0)],
    ['shellback', (p, ph) => new Shellback(p, ph, 0, 0)],
    ['cragstalker', (p, ph) => new Cragstalker(p, ph, 0, 0)],
    ['gloomwisp', (p, ph) => new Gloomwisp(p, ph, 0, 0)],
  ];

  for (const [name, make] of makers) {
    it(`frees every geometry and unshared material of a ${name}`, () => {
      const physics = flatGround();
      const parent = new THREE.Group();
      let leaked = 0;
      for (let i = 0; i < 5; i++) {
        const e = make(parent, physics);
        const owned = new Set<THREE.BufferGeometry | THREE.Material>();
        e.root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          owned.add(o.geometry);
          for (const m of [o.material].flat() as THREE.Material[]) if (!isSharedMaterial(m)) owned.add(m);
        });
        const freed = new Set<unknown>();
        for (const r of owned) r.addEventListener('dispose', () => freed.add(r));
        e.dispose();
        leaked += owned.size - freed.size;
      }
      expect(leaked).toBe(0);
      expect(parent.children.length).toBe(0);
    });
  }
});
