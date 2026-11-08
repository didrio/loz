import type * as THREE from 'three';

/**
 * What a pure model builder returns (docs/pipeline.md, "The registry and validator"): geometry and materials, no
 * physics, no game, no behaviour. The behaviour file adds `root` to its own and keeps stats, timings and hurtboxes;
 * hurtboxes ride the named `joints`.
 */
export interface Model<J extends Record<string, THREE.Object3D> = Record<string, THREE.Object3D>> {
  /** Everything visible, at the origin, facing +z, standing on y = 0 (unless it floats). */
  root: THREE.Object3D;
  /** The parts behaviour poses or hangs hurtboxes on, by name. */
  joints: J;
  /** The unique materials that flash on a hit. */
  flashMats: THREE.MeshLambertMaterial[];
  /** Other unique materials the model animates itself (glowing eyes, an ember, a fading halo). */
  animated?: THREE.Material[];
}
