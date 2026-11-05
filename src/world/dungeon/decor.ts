import * as THREE from 'three';
import { Layer } from '../../core/physics';
import type { FogLook } from '../../render/sky';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import type { RoomDef, RoomTheme } from './format';

/**
 * The look of each wing: stone colors, light, and decoration placed along the walls. All
 * decoration is wall-mounted or flat on the floor in rooms with wakestones (so it can never
 * get in a stone's way); free-standing statues only go in rooms without stones.
 */

export interface Palette {
  floor: number;
  /** A second floor color for checkered tiles (marble), or null for plain. */
  floorAlt: number | null;
  wall: number;
  trim: number;
  ceiling: number;
  pillar: number;
  stair: number;
  pitFloor: number;
  /** The room's point light and sconce flames. */
  light: number;
  /** Multiplies the room light's brightness. */
  lightLevel: number;
  /** The fog while Wren is in a room of this wing. */
  fog: FogLook;
}

export const THEMES: Record<RoomTheme, Palette> = {
  sandstone: { floor: 0x8a7a62, floorAlt: null, wall: 0xab9577, trim: 0x6a5c48, ceiling: 0x3b3329, pillar: 0xbca683, stair: 0x9a876a, pitFloor: 0x14100c, light: 0xffc890, lightLevel: 1, fog: { color: 0x0a0c10, near: 14, far: 60 } },
  marble: { floor: 0xb4b8c0, floorAlt: 0x8a8f99, wall: 0xcfd2d8, trim: 0x787d86, ceiling: 0x484c54, pillar: 0xe2e4e8, stair: 0xbfc3c9, pitFloor: 0x101216, light: 0xe2ecff, lightLevel: 1.15, fog: { color: 0x1c2230, near: 22, far: 80 } },
  moss: { floor: 0x48523f, floorAlt: null, wall: 0x5b6656, trim: 0x363e32, ceiling: 0x21271d, pillar: 0x67735f, stair: 0x55604c, pitFloor: 0x0c1a1c, light: 0xb8e0a8, lightLevel: 0.8, fog: { color: 0x0c1a12, near: 8, far: 38 } },
  basalt: { floor: 0x2c2a29, floorAlt: null, wall: 0x3a3634, trim: 0x1d1b1a, ceiling: 0x131211, pillar: 0x46413d, stair: 0x34302e, pitFloor: 0x1a0804, light: 0xff8a4a, lightLevel: 0.95, fog: { color: 0x2a1208, near: 12, far: 54 } },
};

/** The fog for a room: its wing's, with the room's own overrides on top. */
export function fogOf(r: RoomDef): FogLook {
  const base = THEMES[themeOf(r)].fog;
  return { color: r.fog?.color ?? base.color, near: r.fog?.near ?? base.near, far: r.fog?.far ?? base.far };
}

export const themeOf = (r: RoomDef): RoomTheme => r.theme ?? 'sandstone';

/** A spot on a wall's inner face: position (feet level), facing into the room. */
export interface WallSpot {
  x: number;
  z: number;
  yaw: number;
}

const add = (g: THREE.Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, yaw = 0, emissive = 0) => {
  const m = new THREE.Mesh(geo, mat(color, emissive));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.castShadow = true;
  g.add(m);
  return m;
};

/** Local → world for something on a wall: `along` sideways, `out` into the room, `up`. */
function onWall(s: WallSpot, along: number, out: number) {
  const ox = Math.sin(s.yaw), oz = Math.cos(s.yaw); // into the room
  const sx = Math.cos(s.yaw), sz = -Math.sin(s.yaw); // sideways
  return { x: s.x + ox * out + sx * along, z: s.z + oz * out + sz * along };
}

/**
 * Decorates one room. `spots(spacing)` gives evenly spaced wall spots clear of doorways;
 * `solid` gets static meshes (merged), `glowing` gets additive light shafts.
 */
export function decorateRoom(
  b: AreaBuilder, solid: THREE.Group, glowing: THREE.Group, room: RoomDef, fy: number, height: number,
  spots: (spacing: number) => WallSpot[], hasStones: boolean, rand: () => number,
) {
  const p = THEMES[themeOf(room)];
  // Ground haze: a faint pale sheet just under the lip of each pit, so the drop reads as deep.
  for (const f of room.features ?? []) {
    if (f.kind !== 'pit') continue;
    for (let k = 0; k < 2; k++) {
      const haze = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.02, f.d), new THREE.MeshBasicMaterial({ color: p.light, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
      haze.position.set(room.x + f.x + f.w / 2, fy - 0.35 - k * 0.7, room.z + f.z + f.d / 2);
      glowing.add(haze);
    }
  }
  switch (themeOf(room)) {
    case 'sandstone': {
      for (const s of spots(4)) {
        if (!hasStones) {
          // A keeper, kneeling against the wall, asleep: blocky body, bowed head, closed eyes.
          const at = onWall(s, 0, 0.75);
          add(solid, new THREE.BoxGeometry(1.2, 0.5, 0.9), p.trim, at.x, fy + 0.25, at.z, s.yaw);
          add(solid, new THREE.BoxGeometry(0.9, 1.1, 0.7), p.pillar, at.x, fy + 1.05, at.z, s.yaw);
          const head = onWall(s, 0, 0.95);
          add(solid, new THREE.BoxGeometry(0.55, 0.55, 0.55), p.pillar, head.x, fy + 1.85, head.z, s.yaw);
          for (const side of [-0.13, 0.13]) {
            const eye = onWall(s, side, 1.23);
            add(solid, new THREE.BoxGeometry(0.14, 0.03, 0.02), p.trim, eye.x, fy + 1.88, eye.z, s.yaw);
          }
          b.box(at.x, fy + 1, at.z, 0.6, 1, 0.5, s.yaw, Layer.Prop);
        } else {
          // A sleeping face carved into the wall: flat, so stones slide past it.
          const at = onWall(s, 0, 0.3);
          add(solid, new THREE.BoxGeometry(1.1, 1.4, 0.1), p.trim, at.x, fy + 2.4, at.z, s.yaw);
          for (const side of [-0.22, 0.22]) {
            const eye = onWall(s, side, 0.36);
            add(solid, new THREE.BoxGeometry(0.28, 0.05, 0.03), p.pillar, eye.x, fy + 2.6, eye.z, s.yaw);
          }
        }
      }
      break;
    }
    case 'marble': {
      // Tall windows high on the walls, each throwing a shaft of pale light to the floor.
      for (const s of spots(5)) {
        const at = onWall(s, 0, 0.26);
        add(solid, new THREE.BoxGeometry(1.1, 3.2, 0.06), 0xdfeaff, at.x, fy + height - 2.6, at.z, s.yaw, 0x9fb4d8);
        add(solid, new THREE.BoxGeometry(1.4, 0.2, 0.2), p.trim, at.x, fy + height - 4.3, at.z, s.yaw);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1, height * 0.95, 0.9), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
        const mid = onWall(s, 0, 1.6);
        beam.position.set(mid.x, fy + height * 0.47, mid.z);
        beam.rotation.y = s.yaw;
        beam.rotateX(-0.42);
        glowing.add(beam);
        // Dust caught in the shaft: a few bright specks along its length.
        for (let k = 0; k < 4; k++) {
          const t = rand(), spot = onWall(s, (rand() - 0.5) * 0.6, 0.9 + t * 2.2);
          const speck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
          speck.position.set(spot.x, fy + height * (0.85 - t * 0.75), spot.z);
          glowing.add(speck);
        }
      }
      break;
    }
    case 'moss': {
      // Roots hanging from the ceiling along the walls; moss creeping across the floor's edges.
      for (const s of spots(3)) {
        for (let k = 0; k < 3; k++) {
          const len = 1 + rand() * 2;
          const at = onWall(s, (rand() - 0.5) * 1.6, 0.3 + rand() * 0.3);
          add(solid, new THREE.CylinderGeometry(0.05, 0.09, len, 5), 0x4a3a26, at.x, fy + height - len / 2, at.z);
        }
        const patch = onWall(s, (rand() - 0.5) * 1.5, 0.8);
        add(solid, new THREE.BoxGeometry(1 + rand(), 0.02, 0.6 + rand() * 0.6), 0x3f6a32, patch.x, fy + 0.012, patch.z, s.yaw + (rand() - 0.5) * 0.6);
      }
      break;
    }
    case 'basalt': {
      // Ember cracks glowing in the walls, and a few across the floor.
      for (const s of spots(3.5)) {
        for (let k = 0; k < 2; k++) {
          const at = onWall(s, (rand() - 0.5) * 1.4, 0.27);
          const crack = add(solid, new THREE.BoxGeometry(0.08, 0.6 + rand() * 1.4, 0.04), 0xff7a2a, at.x, fy + 0.6 + rand() * 3, at.z, s.yaw, 0xff5a10);
          crack.rotation.z = (rand() - 0.5) * 1.2;
        }
      }
      for (let k = 0; k < Math.round((room.w * room.d) / 60); k++) {
        const x = room.x + 1.5 + rand() * (room.w - 3), z = room.z + 1.5 + rand() * (room.d - 3);
        add(solid, new THREE.BoxGeometry(0.07, 0.015, 0.8 + rand() * 1.5), 0xff7a2a, x, fy + 0.01, z, rand() * Math.PI, 0xff4a08);
      }
      break;
    }
  }
}
