import * as THREE from 'three';
import { buildHumanoid, type Humanoid, type HumanoidColors } from '../characters';
import { surf, uniqueSurf } from '../materials';
import { shieldModel } from '../shapes';
import { faceted } from '../textures';
import type { Model } from './types';

/** Wren's tunic: orange (slate-blue once the Stoneward Tunic is bought: the game recolours `coatMat`). */
export const WREN_COAT = 0xb4532a;
/** The shield lowered: on the outside of the left forearm (arm space). */
export const SHIELD_REST_POS = new THREE.Vector3(0.14, -0.4, 0.02);

export const WREN_COLORS: HumanoidColors = { skin: 0xf0c49c, hair: 0x2e2018, coat: WREN_COAT, pants: 0x4a4038, boots: 0x5a3a22, accent: 0x2aa198 };

/** A villager's look: Maren's (the registry's stand-in for every NPC; each NPC is `buildHumanoid` with its own colours). */
export const VILLAGER_COLORS: HumanoidColors = { skin: 0xe8b98f, hair: 0xc9c3b8, coat: 0x6b4c8a, pants: 0x3b3040, boots: 0x3a2a1e, accent: 0xd9a531 };

/** A person for the registry: the humanoid, its joints named. */
export function buildPerson(colors: HumanoidColors, scale = 1): Model<{ pivot: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group }> & { humanoid: Humanoid } {
  const humanoid = buildHumanoid(colors, scale);
  const { root, pivot, head, armL, armR, legL, legR } = humanoid;
  return { root, joints: { pivot, head, armL, armR, legL, legR }, flashMats: [], humanoid };
}

/**
 * Wren: the humanoid in her colours with the sword in her right hand and the shield on her left arm (both hidden until she
 * has them: the player shows them). Her tunic, blade and shield wood are unique materials the game recolours, glows and
 * flashes (`coatMat`, `bladeMat`, `shieldMat`).
 */
export function buildWren(): Model<{ pivot: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; sword: THREE.Group; shield: THREE.Group }> & {
  humanoid: Humanoid;
  coatMat: THREE.MeshLambertMaterial;
  bladeMat: THREE.MeshLambertMaterial;
  shieldMat: THREE.MeshLambertMaterial;
} {
  const humanoid = buildHumanoid(WREN_COLORS);
  // The tunic gets its own material, so buying the Stoneward Tunic can recolour it.
  const coatMat = uniqueSurf('cloth', WREN_COAT);
  const shared = surf('cloth', WREN_COAT);
  humanoid.root.traverse((m) => {
    if (m instanceof THREE.Mesh && m.material === shared) m.material = coatMat;
  });
  const shieldMat = uniqueSurf('wood', 0x8b5a2b);
  const bladeMat = uniqueSurf('metal', 0xd8dde3, { emissive: 0x000000 });

  // Sword in the right hand, blade continuing the line of the arm.
  const sword = new THREE.Group();
  const steel = surf('metal', 0xd8dde3), gold = surf('metal', 0xc9a227), grip = surf('leather', 0x3a2412);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.03), bladeMat);
  blade.position.y = -0.78;
  const tip = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.057, 0.18, 4)), steel);
  tip.rotation.x = Math.PI;
  tip.position.y = -1.39;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.1), gold);
  guard.position.y = -0.22;
  const hilt = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6)), grip);
  hilt.position.y = -0.08;
  sword.add(blade, tip, guard, hilt);
  sword.position.y = -0.62;
  sword.visible = false;
  humanoid.armR.add(sword);

  // A round wooden shield on the left arm (its face is local +z).
  const shield = new THREE.Group();
  shield.add(shieldModel(shieldMat, surf('metal', 0x9a9fa6)));
  shield.position.copy(SHIELD_REST_POS);
  shield.visible = false;
  humanoid.armL.add(shield);

  const { root, pivot, head, armL, armR, legL, legR } = humanoid;
  return { root, joints: { pivot, head, armL, armR, legL, legR, sword, shield }, flashMats: [coatMat, bladeMat, shieldMat], humanoid, coatMat, bladeMat, shieldMat };
}
