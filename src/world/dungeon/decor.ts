import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { SHRINE, type FogLook } from '../../render/atmosphere';
import { mat, surf } from '../../render/materials';
import type { SurfaceId } from '../../render/textures';
import { pal } from '../../render/palette';
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
}

export const THEMES: Record<RoomTheme, Palette> = {
  sandstone: { floor: pal('stone'), floorAlt: null, wall: pal('sand', 1), trim: pal('stone', 1), ceiling: pal('stone', 0), pillar: pal('sand'), stair: pal('plaster', 1), pitFloor: pal('ink', 1), light: pal('flame', 3), lightLevel: 1 },
  marble: { floor: pal('slate', 3), floorAlt: pal('slate', 2), wall: pal('chalk', 0), trim: pal('slate', 2), ceiling: pal('slate', 1), pillar: pal('chalk', 1), stair: pal('slate', 3), pitFloor: pal('ink', 2), light: pal('moon', 3), lightLevel: 1.15 },
  moss: { floor: pal('olive', 1), floorAlt: null, wall: pal('moss'), trim: pal('moss', 1), ceiling: pal('ink', 3), pillar: pal('moss', 3), stair: pal('moss'), pitFloor: pal('moss', 0), light: pal('leaf', 3), lightLevel: 0.8 },
  basalt: { floor: pal('slate', 0), floorAlt: null, wall: pal('stone', 0), trim: pal('ink', 2), ceiling: pal('ink', 1), pillar: pal('plaster', 0), stair: pal('slate', 0), pitFloor: pal('bark', 0), light: pal('ember', 3), lightLevel: 0.95 },
};

/**
 * One fog for every dungeon room. Fog is a single scene-wide setting measured from the camera, so a
 * per-room fog changes how a distant room looks as Wren crosses a doorway; one value never does.
 * Each wing's mood comes from its lights and decor instead.
 */
export const DUNGEON_FOG: FogLook = SHRINE.fog;

export const themeOf = (r: RoomDef): RoomTheme => r.theme ?? 'sandstone';

/** A spot on a wall's inner face: position (feet level), facing into the room. */
export interface WallSpot {
  x: number;
  z: number;
  yaw: number;
}

const add = (g: THREE.Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, yaw = 0, emissive = 0, surface?: SurfaceId) => {
  const m = new THREE.Mesh(geo, surface ? surf(surface, color, emissive) : mat(color, emissive));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
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
          add(solid, new THREE.BoxGeometry(1.2, 0.5, 0.9), p.trim, at.x, fy + 0.25, at.z, s.yaw, 0, 'stone');
          add(solid, new THREE.BoxGeometry(0.9, 1.1, 0.7), p.pillar, at.x, fy + 1.05, at.z, s.yaw, 0, 'stone');
          const head = onWall(s, 0, 0.95);
          add(solid, new THREE.BoxGeometry(0.55, 0.55, 0.55), p.pillar, head.x, fy + 1.85, head.z, s.yaw, 0, 'stone');
          for (const side of [-0.13, 0.13]) {
            const eye = onWall(s, side, 1.23);
            add(solid, new THREE.BoxGeometry(0.14, 0.03, 0.02), p.trim, eye.x, fy + 1.88, eye.z, s.yaw, 0, 'stone');
          }
          b.box(at.x, fy + 1, at.z, 0.6, 1, 0.5, s.yaw, Layer.Prop);
        } else {
          // A sleeping face carved into the wall: flat, so stones slide past it.
          const at = onWall(s, 0, 0.3);
          add(solid, new THREE.BoxGeometry(1.1, 1.4, 0.1), p.trim, at.x, fy + 2.4, at.z, s.yaw, 0, 'stone');
          for (const side of [-0.22, 0.22]) {
            const eye = onWall(s, side, 0.36);
            add(solid, new THREE.BoxGeometry(0.28, 0.05, 0.03), p.pillar, eye.x, fy + 2.6, eye.z, s.yaw, 0, 'stone');
          }
        }
      }
      break;
    }
    case 'marble': {
      // Tall windows high on the walls, each throwing a shaft of pale light to the floor.
      for (const s of spots(5)) {
        const at = onWall(s, 0, 0.26);
        add(solid, new THREE.BoxGeometry(1.1, 3.2, 0.06), pal('moon', 3), at.x, fy + height - 2.6, at.z, s.yaw, pal('sky', 2));
        add(solid, new THREE.BoxGeometry(1.4, 0.2, 0.2), p.trim, at.x, fy + height - 4.3, at.z, s.yaw, 0, 'stone');
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1, height * 0.95, 0.9), new THREE.MeshBasicMaterial({ color: pal('sky', 3), transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
        const mid = onWall(s, 0, 1.6);
        beam.position.set(mid.x, fy + height * 0.47, mid.z);
        beam.rotation.y = s.yaw;
        beam.rotateX(-0.42);
        glowing.add(beam);
        // Dust caught in the shaft: a few bright specks along its length.
        for (let k = 0; k < 4; k++) {
          const t = rand(), spot = onWall(s, (rand() - 0.5) * 0.6, 0.9 + t * 2.2);
          const speck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: pal('chalk', 2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
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
          add(solid, new THREE.CylinderGeometry(0.05, 0.09, len, 5), pal('bark', 1), at.x, fy + height - len / 2, at.z, 0, 0, 'bark');
        }
        const patch = onWall(s, (rand() - 0.5) * 1.5, 0.8);
        add(solid, new THREE.BoxGeometry(1 + rand(), 0.02, 0.6 + rand() * 0.6), pal('leaf'), patch.x, fy + 0.012, patch.z, s.yaw + (rand() - 0.5) * 0.6, 0, 'foliage');
      }
      break;
    }
    case 'basalt': {
      // Ember cracks glowing in the walls, and a few across the floor.
      for (const s of spots(3.5)) {
        for (let k = 0; k < 2; k++) {
          const at = onWall(s, (rand() - 0.5) * 1.4, 0.27);
          const crack = add(solid, new THREE.BoxGeometry(0.08, 0.6 + rand() * 1.4, 0.04), pal('ember'), at.x, fy + 0.6 + rand() * 3, at.z, s.yaw, pal('ember'));
          crack.rotation.z = (rand() - 0.5) * 1.2;
        }
      }
      for (let k = 0; k < Math.round((room.w * room.d) / 60); k++) {
        const x = room.x + 1.5 + rand() * (room.w - 3), z = room.z + 1.5 + rand() * (room.d - 3);
        add(solid, new THREE.BoxGeometry(0.07, 0.015, 0.8 + rand() * 1.5), pal('ember'), x, fy + 0.01, z, rand() * Math.PI, pal('ember'));
      }
      break;
    }
  }
}
