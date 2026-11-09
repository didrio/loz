import type * as THREE from 'three';

/**
 * A person's joints, as the player holds them (`game/player.ts`). Faces +z; `pivot` sits at hip height so leans, falls and
 * recoils rotate around the middle of the body, not the feet. The bodies themselves are kit models: Wren
 * (`render/models/wren.ts`) and the villagers (`render/models/villager.ts`).
 */
export interface Humanoid {
  root: THREE.Group;
  pivot: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}
