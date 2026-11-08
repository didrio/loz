import * as THREE from 'three';
import { fadeInFog } from './materials';
import { faceted } from './textures';

/** A chunky extruded heart, centered on the origin (about 0.7 m wide at scale 1). */
export function heartGeometry(depth = 0.12) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.05, -0.2, -0.35, -0.05, -0.35, 0.12);
  s.bezierCurveTo(-0.35, 0.32, -0.08, 0.36, 0, 0.18);
  s.bezierCurveTo(0.08, 0.36, 0.35, 0.32, 0.35, 0.12);
  s.bezierCurveTo(0.35, -0.05, 0.05, -0.2, 0, -0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.center();
  return g;
}

/**
 * Wren's round wooden shield: a plank disc, an iron rim and a boss. Its face is local +z. `wood` is
 * passed in so the player can flash it red (a guard break).
 */
export function shieldModel(wood: THREE.Material, iron: THREE.Material) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12)), wood);
  disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.42, 0.04, 4, 16)), iron);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), iron);
  boss.position.z = 0.05;
  g.add(disc, rim, boss);
  return g;
}

/** A soft additive glow ball, for flames, sparks and magic. */
export function glow(color: number, radius: number, opacity = 0.35) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    fadeInFog(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
}

const SHADOW_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
/** How high above the ground a floating thing's shadow fades out completely (meters). */
const SHADOW_FADE = 12;

/**
 * A dark disc on the ground under something that floats (orbs, wisps), so you can read how
 * far away it is and how high: the higher it flies, the smaller and fainter the disc.
 * Not a real shadow (those are hard to read on flat-shaded ground at night); a blob, the
 * way late-90s games did it. Call `place` every frame with the ground height under it.
 */
export class GroundShadow {
  readonly mesh: THREE.Mesh;
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  constructor(parent: THREE.Object3D, private readonly size: number) {
    this.mesh = new THREE.Mesh(SHADOW_GEO, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** Puts the disc at `groundY` under (x, z) for something at height `y`; hides it with no ground. */
  place(x: number, y: number, z: number, groundY: number | null, strength = 1) {
    const h = groundY === null ? Infinity : y - groundY;
    const k = 1 - Math.min(1, Math.max(0, h) / SHADOW_FADE);
    this.mesh.visible = k > 0.02 && strength > 0.02;
    if (!this.mesh.visible) return;
    this.mesh.position.set(x, groundY! + 0.04, z);
    this.mesh.scale.setScalar(this.size * (0.45 + 0.55 * k));
    this.material.opacity = 0.5 * k * strength;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}
