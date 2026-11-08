import * as THREE from 'three';
import { mat, surf } from './materials';
import { faceted } from './textures';

export interface HumanoidColors {
  skin: number;
  hair: number;
  coat: number;
  pants: number;
  boots: number;
  accent: number;
}

/**
 * A blocky person built from primitives. Faces +z. `pivot` sits at hip height so
 * leans, falls and recoils rotate around the middle of the body, not the feet.
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

export function buildHumanoid(c: HumanoidColors, scale = 1): Humanoid {
  // Clothes are cloth, boots and belt leather, skin and hair have their own tiles; only the eyes stay plain (T41, and the owner's follow-up). Textured pieces are `faceted`
  // (a cylinder, sphere or torus needs its faces' own normals to project a tile); boxes don't.
  const coat = surf('cloth', c.coat), pants = surf('cloth', c.pants), accent = surf('cloth', c.accent), boots = surf('leather', c.boots);
  const skin = surf('skin', c.skin), hair = surf('hide', c.hair), dark = mat(0x1b1410);

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 0.9;
  root.add(pivot);
  const body = new THREE.Group();
  body.position.y = -0.9;
  pivot.add(body);

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(geo, mat);
    me.position.set(x, y, z);
    return me;
  };

  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.85, 0);
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), pants, 0, -0.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.28, 0.36), boots, 0, -0.72, 0.04));
    body.add(g);
    return g;
  };
  const legL = leg(0.14);
  const legR = leg(-0.14);

  body.add(mesh(faceted(new THREE.CylinderGeometry(0.31, 0.42, 0.75, 8)), coat, 0, 1.2, 0));
  body.add(mesh(faceted(new THREE.CylinderGeometry(0.43, 0.52, 0.3, 8)), coat, 0, 0.78, 0));
  body.add(mesh(faceted(new THREE.CylinderGeometry(0.44, 0.44, 0.09, 8)), boots, 0, 0.97, 0));
  const scarf = mesh(faceted(new THREE.TorusGeometry(0.25, 0.09, 6, 10)), accent, 0, 1.58, 0);
  scarf.rotation.x = Math.PI / 2;
  body.add(scarf);
  const tail = mesh(new THREE.BoxGeometry(0.16, 0.45, 0.06), accent, 0.1, 1.38, -0.3);
  tail.rotation.z = 0.2;
  body.add(tail);

  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.5, 0);
    g.rotation.order = 'YXZ';
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), coat, 0, -0.3, 0));
    g.add(mesh(faceted(new THREE.SphereGeometry(0.11, 6, 5)), skin, 0, -0.65, 0));
    body.add(g);
    return g;
  };
  const armL = arm(0.44);
  const armR = arm(-0.44);

  const head = new THREE.Group();
  head.position.y = 1.88;
  head.add(mesh(faceted(new THREE.SphereGeometry(0.3, 10, 8)), skin));
  const cap = mesh(faceted(new THREE.SphereGeometry(0.33, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.03, -0.03);
  cap.rotation.x = -0.35;
  head.add(cap);
  head.add(mesh(new THREE.BoxGeometry(0.06, 0.09, 0.03), dark, 0.11, 0.0, 0.28));
  head.add(mesh(new THREE.BoxGeometry(0.06, 0.09, 0.03), dark, -0.11, 0.0, 0.28));
  body.add(head);

  root.scale.setScalar(scale);
  return { root, pivot, head, armL, armR, legL, legR };
}
