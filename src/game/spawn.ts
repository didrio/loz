import type * as THREE from 'three';
import type { Physics } from '../core/physics';
import { Cragstalker } from './cragstalker';
import { Gloomwisp, Thornling, type Enemy } from './enemies';
import { DozingSentinel } from './sentinel';
import { Shellback } from './shellback';

/**
 * Dev-only: builds a registered enemy by its registry id (render/models/registry.ts), for `embervale.spawn(id, x, z)`.
 * Bosses and the mini-boss belong to their arenas and are not here.
 */
export const ENEMY_SPAWNERS: Record<string, (parent: THREE.Object3D, physics: Physics, x: number, z: number) => Enemy> = {
  thornling: (p, ph, x, z) => new Thornling(p, ph, x, z),
  gloomwisp: (p, ph, x, z) => new Gloomwisp(p, ph, x, z),
  'dozing-sentinel': (p, ph, x, z) => new DozingSentinel(p, ph, x, z),
  shellback: (p, ph, x, z) => new Shellback(p, ph, x, z),
  cragstalker: (p, ph, x, z) => new Cragstalker(p, ph, x, z),
};
