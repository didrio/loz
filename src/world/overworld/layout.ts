import { fbm, mix, smoothstep } from '../../core/math';

/**
 * The map of Emberfield and its landmarks, as pure functions of (x, z). The terrain shape is
 * a formula, so the mesh, the physics collider and object placement can never disagree.
 * Units are meters; +x is east, -z is north.
 */

export const WORLD_RADIUS = 172;
export const WATER_Y = -1;
export const SPAWN = { x: 0, z: 14, facing: Math.PI };
export const VILLAGE = { x: -62, z: -58, r: 30 };
/** Tobin's windmill on the village's west side; its door faces east, onto the square. */
export const MILL = { x: VILLAGE.x - 22, z: VILLAGE.z };
/** The Morrowbell's post on the square, between the east and northeast cottages (clear of both doors), facing the well (docs/bells.md). */
export const MORROW_POST = { x: VILLAGE.x + 9.4, z: VILLAGE.z - 5.7 };
/** Odo the merchant's stall: his counter runs north-south, customers stand on its east side. */
export const STALL = { x: VILLAGE.x - 5.4, z: VILLAGE.z - 4 };
export const GROVE = { x: 82, z: -78 };
export const SHRINE = { x: 108, z: 28 };
export const LAKE = { x: -100, z: 100 };
/** Gloaming Hollow: a sunken clearing at the end of the south road, the Lamplighter's arena. */
export const HOLLOW = { x: -23, z: 127, r: 15, floor: 0.6 };

export function riverZ(x: number) {
  return 66 + 16 * Math.sin(x * 0.022) + 6 * Math.sin(x * 0.061 + 1);
}

export const BRIDGE = { x: -14, z: riverZ(-14), halfLen: 13, halfW: 2.2 };

/** Height of the bridge deck along its length (an arch). */
export function bridgeDeck(z: number) {
  return 0.5 + Math.cos(((z - BRIDGE.z) / BRIDGE.halfLen) * (Math.PI / 2));
}

/** The door of the shrine, on the west face of the shrine house. */
export const SHRINE_DOOR = { x: SHRINE.x - 4.2, z: SHRINE.z };

export const PATHS: [number, number][][] = [
  [[SPAWN.x, SPAWN.z], [-20, -15], [-40, -38], [VILLAGE.x + 14, VILLAGE.z + 14], [VILLAGE.x + 4, VILLAGE.z + 4]],
  [[SPAWN.x, SPAWN.z], [-8, 35], [BRIDGE.x, BRIDGE.z - 15], [BRIDGE.x, BRIDGE.z + 15], [-22, 115]],
  [[SPAWN.x, SPAWN.z], [30, -20], [60, -52], [GROVE.x - 6, GROVE.z + 6]],
  [[SPAWN.x, SPAWN.z], [45, 22], [80, 26], [SHRINE_DOOR.x - 1, SHRINE_DOOR.z]],
];

/** Where the south road meets the hollow. */
export const HOLLOW_ENTRANCE = { x: -22, z: 115 };

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance to the nearest dirt road. */
export function pathDist(x: number, z: number) {
  let d = Infinity;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  }
  return d;
}

/**
 * The land as it was first laid out, before later landmarks (the hollow) were carved in.
 * Scenery placement uses this, so adding a landmark never reshuffles the seeded trees
 * elsewhere; anything that lands inside a new landmark is filtered out afterwards.
 */
export function placementHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.012 + 10, z * 0.012 - 4) - 0.5) * 16 + (fbm(x * 0.06, z * 0.06) - 0.5) * 1.6;
  h *= 0.35 + 0.65 * smoothstep(30, 120, r);
  h += smoothstep(128, 182, r) * (40 + fbm(x * 0.025 + 3, z * 0.025) * 45);
  h = mix(h, 9, smoothstep(32, 15, Math.hypot(x - SHRINE.x, z - SHRINE.z)));
  h = mix(h, 1.2, smoothstep(VILLAGE.r + 18, VILLAGE.r + 2, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)));
  h = mix(h, 0.8, smoothstep(16, 6, Math.hypot(x - GROVE.x, z - GROVE.z)));
  h = mix(h, -2.8, smoothstep(34, 20, Math.hypot(x - LAKE.x, z - LAKE.z)));
  h = mix(h, -2.6, smoothstep(13, 5, Math.abs(z - riverZ(x))));
  return h;
}

/** The shape of the land: a gentle field ringed by mountains, carved by a river and a lake. */
export function terrainHeight(x: number, z: number) {
  const h = placementHeight(x, z);
  return mix(h, HOLLOW.floor, smoothstep(HOLLOW.r + 9, HOLLOW.r, Math.hypot(x - HOLLOW.x, z - HOLLOW.z)));
}

/** True within `margin` meters of the hollow's edge (or inside it). */
export function inHollow(x: number, z: number, margin = 0) {
  return Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.r + margin;
}

/** Which named place a point is in (shown as a title when you walk in). */
export function areaNameAt(x: number, z: number) {
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 4) return 'Thistledown Village';
  if (Math.hypot(x - GROVE.x, z - GROVE.z) < 36) return 'The Whispering Grove';
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 28) return 'The Waking Shrine';
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 38) return 'Glimmer Lake';
  if (inHollow(x, z, 3)) return 'Gloaming Hollow';
  return 'Emberfield';
}

/** Open land where scenery may go: not in water, on roads, at landmarks or near the start. */
export function isOpen(x: number, z: number, pathClear = 4) {
  if (Math.hypot(x, z) > 178) return false;
  if (Math.abs(z - riverZ(x)) < 11) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 36) return false;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 4) return false;
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 27) return false;
  if (Math.hypot(x - GROVE.x, z - GROVE.z) < 9) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 12) return false;
  if (pathDist(x, z) < pathClear) return false;
  const h = placementHeight(x, z);
  return h > -0.3 && h < 30;
}

/** Where thornlings may roam: open field, away from the village, start, shrine and water. */
export function isEnemyGround(x: number, z: number) {
  if (Math.hypot(x, z) > 140) return false;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 10) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 22) return false;
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 16) return false;
  if (Math.abs(z - riverZ(x)) < 12 || Math.hypot(x - LAKE.x, z - LAKE.z) < 34) return false;
  if (inHollow(x, z, 12)) return false;
  return true;
}
