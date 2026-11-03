import * as THREE from 'three';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { inGate, inGorge, inHollow, inPass, inRuin, isOpen, terrainHeight } from './layout';

/**
 * The blight's growths: clusters of dark violet thorns standing in the open field while the valley is
 * sick. They shrink away as the blight lifts (`setLevel`) and are gone once it has. They're scenery only
 * (no colliders), drawn from their own RNG so they never move the trees and rocks.
 */
export function buildBlightGrowths(b: AreaBuilder, rand: () => number) {
  const bases: { x: number; y: number; z: number; q: THREE.Quaternion; s: number }[] = [];
  const colors: THREE.Color[] = [];
  let tries = 0, clusters = 0;
  while (clusters < 70 && tries++ < 3000) {
    const cx = (rand() - 0.5) * 340, cz = (rand() - 0.5) * 340;
    if (!isOpen(cx, cz, 5) || inGate(cx, cz, 6) || inHollow(cx, cz, 8) || inGorge(cx, cz, 4) || inPass(cx, cz, 4) || inRuin(cx, cz, 5)) continue;
    clusters++;
    const thorns = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < thorns; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 1.6;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = 0.7 + rand() * 1.1;
      const tilt = (rand() - 0.5) * 0.9;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rand() * 6, (rand() - 0.5) * 0.9));
      bases.push({ x, y: terrainHeight(x, z), z, q, s });
      colors.push(new THREE.Color().setHSL(0.76 + rand() * 0.06, 0.4, 0.14 + rand() * 0.08));
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 1.5, 5).translate(0, 0.75, 0), mat(0xffffff, 0x1c0f2a), bases.length);
  colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  b.dynamic(mesh);

  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  let shown = -1;
  return {
    count: bases.length,
    /** 1 = full grown, 0 = gone (hidden). Each thorn shrinks into its own base. */
    setLevel(level: number) {
      if (level === shown) return;
      shown = level;
      mesh.visible = level > 0.01;
      if (!mesh.visible) return;
      bases.forEach((t, i) => {
        scale.set(t.s, t.s * level, t.s);
        m.compose(pos.set(t.x, t.y, t.z), t.q, scale);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
