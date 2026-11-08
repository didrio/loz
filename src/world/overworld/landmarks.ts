import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat, surf } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { GreatLantern } from '../objects';
import { BRIDGE, bridgeDeck, GATE, GROVE, HOLLOW_ENTRANCE, SHRINE, SPAWN, terrainHeight, VILLAGE } from './layout';

/** The arched wooden bridge over the river: planks and rails, with a smooth deck collider. */
export function buildBridge(b: AreaBuilder) {
  const plank = surf('wood', 0x8b5e34), post = surf('wood', 0x5e3d20);
  const n = 22;
  const zAt = (i: number) => BRIDGE.z - BRIDGE.halfLen + (i / n) * BRIDGE.halfLen * 2;
  for (let i = 0; i <= n; i++) {
    const z = zAt(i);
    const y = bridgeDeck(z);
    const m = b.mesh(new THREE.BoxGeometry(BRIDGE.halfW * 2 + 0.3, 0.18, 1.1), plank, BRIDGE.x, y - 0.09, z);
    m.rotation.x = Math.sin(((z - BRIDGE.z) / BRIDGE.halfLen) * (Math.PI / 2)) * 0.12;
    if (i % 4 === 0) {
      for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), post, BRIDGE.x + s * BRIDGE.halfW, y + 0.45, z);
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i += 4) {
      const z0 = zAt(i), z1 = zAt(Math.min(n, i + 4));
      const y0 = bridgeDeck(z0) + 0.9, y1 = bridgeDeck(z1) + 0.9;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const rail = b.mesh(new THREE.BoxGeometry(0.12, 0.12, len), post, BRIDGE.x + s * BRIDGE.halfW, (y0 + y1) / 2, (z0 + z1) / 2);
      rail.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      b.track(b.physics.box(BRIDGE.x + s * BRIDGE.halfW, (y0 + y1) / 2 - 0.4, (z0 + z1) / 2, 0.12, 0.6, len / 2, 0, Layer.Prop)).setRotation(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(y1 - y0, z1 - z0)),
      );
    }
  }
  // Deck collider: a ribbon of triangles following the arch, slightly wider than the planks.
  const verts: number[] = [], idx: number[] = [];
  const w = BRIDGE.halfW + 0.15;
  for (let i = 0; i <= n * 2; i++) {
    const z = BRIDGE.z - BRIDGE.halfLen + (i / (n * 2)) * BRIDGE.halfLen * 2;
    const y = bridgeDeck(z);
    verts.push(BRIDGE.x - w, y, z, BRIDGE.x + w, y, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  b.track(b.physics.trimesh(new Float32Array(verts), new Uint32Array(idx)));
}

/** The grove clearing: a ring of stones and a fallen log around the chest. */
export function buildGrove(b: AreaBuilder) {
  const { x, z } = GROVE;
  const stone = surf('rock', 0x8a877e);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const sx = x + Math.cos(a) * 4.2, sz = z + Math.sin(a) * 4.2;
    b.mesh(new THREE.DodecahedronGeometry(0.45), stone, sx, terrainHeight(sx, sz) + 0.2, sz).scale.y = 0.6;
  }
  const lx = x + 6, lz = z - 3, ly = terrainHeight(lx, lz) + 0.4;
  const log = b.mesh(new THREE.CylinderGeometry(0.45, 0.5, 5, 8), surf('bark', 0x5a3a1e), lx, ly, lz);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = 0.6;
  b.box(lx, ly, lz, 2.5, 0.45, 0.45, 0.6, Layer.Prop);
}

/** The shrine on the eastern hill: a stone house with a gate, a dead lantern and old pillars. */
export function buildShrine(b: AreaBuilder) {
  const { x, z } = SHRINE;
  const y = 9;
  const stone = surf('stone', 0x8f8a80), dark = surf('stone', 0x5e5a53), moss = mat(0x5d7d3c);
  b.mesh(new THREE.BoxGeometry(7, 7, 10), stone, x + 0.5, y + 3.3, z);
  b.mesh(new THREE.BoxGeometry(8, 0.8, 11), dark, x + 0.5, y + 7.1, z);
  const roof = b.mesh(new THREE.ConeGeometry(5.4, 3.5, 4), dark, x + 0.5, y + 9.2, z);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 1.4;
  b.mesh(new THREE.BoxGeometry(0.4, 5.2, 4.4), mat(0x15151a), x - 3.1, y + 2.5, z);
  for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(1.3, 6.2, 1.3), stone, x - 3.6, y + 3.1, z + s * 2.6);
  b.mesh(new THREE.BoxGeometry(1.8, 1, 7.2), stone, x - 3.6, y + 6.6, z);
  b.mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 6), dark, x + 0.5, y + 11.5, z);
  const lantern = new GreatLantern(b, x + 0.5, y + 13, z);
  b.box(x + 0.5, y + 3.3, z, 3.5, 3.6, 5);
  for (const s of [-1, 1]) b.box(x - 3.6, y + 3.1, z + s * 2.6, 0.65, 3.1, 0.65);

  // Ring of old pillars, some broken, open toward the west.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.3) continue;
    const px = x + Math.cos(a) * 13, pz = z + Math.sin(a) * 13;
    const h = i % 3 === 0 ? 1.6 + b.rand() : 4.5 + b.rand() * 1.5;
    const py = terrainHeight(px, pz);
    b.mesh(new THREE.BoxGeometry(1.1, h, 1.1), stone, px, py + h / 2, pz).rotation.y = a;
    if (h > 3) b.mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), dark, px, py + h + 0.2, pz).rotation.y = a;
    b.mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), moss, px, py + 0.15, pz).rotation.y = a;
    b.box(px, py + h / 2, pz, 0.55, h / 2, 0.55, a);
  }

  // Inscribed pedestal in front of the door.
  const px = x - 9, pz = z + 4, py = terrainHeight(px, pz);
  b.mesh(new THREE.BoxGeometry(1, 1.2, 1), stone, px, py + 0.6, pz);
  b.mesh(new THREE.BoxGeometry(1.2, 0.15, 1.2), dark, px, py + 1.25, pz);
  b.box(px, py + 0.6, pz, 0.6, 0.65, 0.6, 0, Layer.Prop);
  return { pedestal: { x: px, z: pz }, lantern };
}

/**
 * A signpost facing the starting point: a wooden board with a paper notice on the front,
 * covered in scribbled "writing" (rows of ink dashes and a small seal). The real words show
 * when Wren reads it. The scribbles come from the sign's position, not the shared RNG.
 */
export function buildSign(b: AreaBuilder, x: number, z: number) {
  const y = terrainHeight(x, z);
  const wood = surf('wood', 0xb07a44, 0x6a4824), dark = surf('wood', 0x8a5e34, 0x4a3016), paper = mat(0xfaf0d2, 0xbeb28c), ink = mat(0x3a2a1e), seal = mat(0xc23b2a, 0x5a1a10);
  // (Emissive, because a sign faces the spawn, often away from the sun, and would sit in gloom.)
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = Math.atan2(SPAWN.x - x, SPAWN.z - z);
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(px, py, pz);
    g.add(me);
    return me;
  };
  part(new THREE.BoxGeometry(0.26, 2.1, 0.2), dark, 0, 1.05, -0.12); // behind the board
  part(new THREE.BoxGeometry(1.8, 1.1, 0.12), wood, 0, 1.6, 0.02);
  part(new THREE.BoxGeometry(1.95, 0.1, 0.22), dark, 0, 2.2, 0.02); // cap
  part(new THREE.BoxGeometry(1.5, 0.86, 0.04), paper, 0, 1.6, 0.09);
  // Scribbled lines: a few short dashes per row, widths picked from a hash of the position.
  let h = Math.floor(Math.abs(x * 31 + z * 17)) + 7;
  const next = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let row = 0; row < 4; row++) {
    let px = -0.62;
    const py = 1.9 - row * 0.16;
    while (px < 0.55) {
      const w = 0.12 + next() * 0.28;
      if (px + w > 0.66) break;
      part(new THREE.BoxGeometry(w, 0.05, 0.02), ink, px + w / 2, py, 0.12);
      px += w + 0.07 + next() * 0.06;
    }
  }
  part(new THREE.BoxGeometry(0.14, 0.14, 0.02), seal, 0.52, 1.28, 0.12).rotation.z = Math.PI / 4;
  b.dynamic(g);
  b.cylinder(x, y + 1.0, z, 1.0, 0.3, Layer.Prop);
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

/**
 * Which way to `target` as an arrow on a sign, for someone standing in front of it reading it
 * (signs face the spawn, so "up" is away from the spawn, through the board). One of 8 arrows.
 */
export function signArrow(sign: { x: number; z: number }, target: { x: number; z: number }) {
  const fx = sign.x - SPAWN.x, fz = sign.z - SPAWN.z;
  const dx = target.x - sign.x, dz = target.z - sign.z;
  // The reader's right, with +x east and -z north: facing north (0, -1), right is east (1, 0).
  const ahead = dx * fx + dz * fz, right = dx * -fz + dz * fx;
  const a = Math.atan2(right, ahead);
  return ARROWS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

export const SIGNS = [
  { id: 'sign.crossroads', x: SPAWN.x + 3, z: SPAWN.z - 3 },
  { id: 'sign.village', x: VILLAGE.x + 21, z: VILLAGE.z + 22 },
  { id: 'sign.grove', x: GROVE.x - 13, z: GROVE.z + 13 },
  { id: 'sign.gorge', x: -119.5, z: 19 },
  { id: 'sign.gate', x: GATE.x + GATE.halfOpening + 3.5, z: GATE.z + 12 }, // clear of the rock shoulders beside the gate
  { id: 'sign.canyon', x: -6.5, z: -266.5 },
  { id: 'sign.hollow', x: HOLLOW_ENTRANCE.x + 3.5, z: HOLLOW_ENTRANCE.z - 4 },
];
