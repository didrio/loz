import { fbm, mix, mulberry32, smoothstep } from '../../core/math';

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
/**
 * The windmill's tower (world/overworld/village.ts): radii at the ground (`outer`, walls 0.9 m thick
 * down to `inner`, the room) and at the top, its height, the room's ceiling, its sides, and half the
 * doorway's angle (one side, so the doorway's cut lines up with the tower's corners above it). Tobin's room is its ground floor; the door faces the square (+x).
 */
export const MILL_TOWER = { outer: 4.8, inner: 3.9, top: 3.0, height: 11, ceiling: 3.4, sides: 32, gap: (Math.PI * 2) / 32 };
/** Tobin's bed, from the mill's middle: against the back wall, its head to the north (+z). */
export const MILL_BED = { x: -2.5, z: 0.9 };
/** The Morrowbell's post on the square, between the east and northeast cottages (clear of both doors), facing the well (docs/bells.md). */
export const MORROW_POST = { x: VILLAGE.x + 9.4, z: VILLAGE.z - 5.7 };
/** Odo the merchant's stall: his counter runs north-south, customers stand on its east side. */
/** Thistledown's two standing homes: the angle (around the square, 17 m out) each stands at; each faces the well. */
export const HOMES = [-0.15, 2.35].map((a) => ({ a, x: VILLAGE.x + Math.cos(a) * 17, z: VILLAGE.z + Math.sin(a) * 17 }));
export const STALL = { x: VILLAGE.x - 5.4, z: VILLAGE.z - 4 };
export const GROVE = { x: 82, z: -78 };
export const SHRINE = { x: 108, z: 28 };
export const LAKE = { x: -100, z: 100 };
/**
 * The magic gate at the valley's north edge, at the mouth of the Northpass (shrine session D1; the pass
 * itself is `PASS` below). The arch faces south; `halfOpening` is half the width of the cut it closes.
 */
export const GATE = { x: 8, z: -121, halfOpening: 4.2 };
/** Gloaming Hollow: a sunken clearing at the end of the south road, the Lamplighter's arena. */
export const HOLLOW = { x: -23, z: 127, r: 15, floor: 0.6 };
/**
 * The Murmurbuds (sleeping bulbs holding the keepers' notes), tucked into the valley's nooks. Ids are
 * `bud.<hint>`; what each note says is in content/hints.ts.
 */
export const BUDS = [
  { id: 'bud.tunic', x: -30, z: -56 }, // off the road to Thistledown, northwest of the start
  { id: 'bud.flasks', x: 26, z: 106 }, // the river's south bank, east of the bridge
  { id: 'bud.bells', x: -111, z: 28 }, // by the Hushing Gorge's mouth
  { id: 'bud.boss', x: 48, z: 30 }, // beside the shrine road, before the ford
] as const;

/**
 * Each region draws its scenery from its own seeded stream, so changing one region can never
 * reshuffle another. The valley's 1337 and the hollow's 4242 are the original seeds (the layout
 * players already know); new regions add a line here.
 */
const REGION_SEEDS = { valley: 1337, hollow: 4242, gorge: 7301, pass: 9157, blight: 5521 } as const;
export const regionRng = (region: keyof typeof REGION_SEEDS) => mulberry32(REGION_SEEDS[region]);

/**
 * The Hushing Gorge (docs/bells.md): a winding cut into the western mountain ring, the Morrowbell's
 * trial. `path` runs from the mouth inward; the floor climbs from the field to `floor` over the first
 * 30 m, a pit opens at `pitAt` (the climb), and the walls rise `wall` m above the floor.
 */
export const GORGE = {
  path: [[-124, 12], [-138, 8], [-150, 0], [-160, -10], [-162, -24], [-154, -36], [-142, -44], [-130, -50]] as [number, number][],
  floor: 7,
  pitAt: 62,
  pitDepth: 6,
  /** Half-width of the flat floor, then where the walls reach full height and where they melt into the hills. */
  halfWidth: 5,
  wallTop: 11,
  reach: 28,
  wall: 11,
};

/** A centerline through points: how far along it you are, and the point, direction and normal at a distance. */
function centerline(path: [number, number][]) {
  const segs = path.slice(1).map((p, i) => {
    const [ax, az] = path[i];
    return { ax, az, bx: p[0], bz: p[1], len: Math.hypot(p[0] - ax, p[1] - az) };
  });
  const offsets = segs.reduce<number[]>((o, g) => [...o, o[o.length - 1] + g.len], [0]);
  const length = offsets[segs.length];
  return {
    length,
    segs,
    /** The point `s` meters along, its unit direction (inward) and its left-hand normal. */
    point(s: number) {
      const c = Math.max(0, Math.min(length, s));
      let i = segs.findIndex((_, k) => c <= offsets[k + 1]);
      if (i < 0) i = segs.length - 1;
      const g = segs[i];
      const t = (c - offsets[i]) / g.len;
      const dx = (g.bx - g.ax) / g.len, dz = (g.bz - g.az) / g.len;
      return { x: g.ax + (g.bx - g.ax) * t, z: g.az + (g.bz - g.az) * t, dx, dz, nx: dz, nz: -dx };
    },
    /** Distance `d` from the centerline and how far along it (`s`) the nearest point is. */
    frame(x: number, z: number) {
      let d = Infinity, s = 0;
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const dx = g.bx - g.ax, dz = g.bz - g.az;
        const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
        const di = Math.hypot(x - (g.ax + dx * t), z - (g.az + dz * t));
        if (di < d) { d = di; s = offsets[i] + t * g.len; }
      }
      return { d, s };
    },
  };
}

const gorgeLine = centerline(GORGE.path);
/** Length of the gorge's centerline, m. */
export const GORGE_LENGTH = gorgeLine.length;
/** The centerline point `s` meters in, its unit direction (inward) and its left-hand normal. */
export const gorgePoint = gorgeLine.point;
/** Distance `d` from the gorge's centerline and how far along it (`s`) the nearest point is. */
export const gorgeFrame = gorgeLine.frame;

/** The floor's height `s` meters in (before the pit): from the field's level at the mouth up to `floor`. */
export function gorgeFloor(s: number) {
  const [mx, mz] = GORGE.path[0];
  return mix(placementHeight(mx, mz), GORGE.floor, smoothstep(0, 30, s));
}

/** True within `margin` meters of the gorge's carved area (or inside it). */
export function inGorge(x: number, z: number, margin = 0) {
  return gorgeFrame(x, z).d < GORGE.reach + margin;
}

/** The land with the gorge cut into it: a notch between walls, climbing from the mouth, with a pit near the end. */
function carveGorge(h: number, x: number, z: number) {
  const { d, s } = gorgeFrame(x, z);
  if (d >= GORGE.reach) return h;
  const pit = smoothstep(GORGE.pitAt, GORGE.pitAt + 4, s) * (1 - smoothstep(GORGE.halfWidth - 1, GORGE.halfWidth + 2, d));
  const floor = gorgeFloor(s) - GORGE.pitDepth * pit;
  const wall = GORGE.wall * smoothstep(GORGE.halfWidth, GORGE.wallTop, d) * smoothstep(0, 18, s);
  return mix(floor + wall, h, smoothstep(GORGE.wallTop, GORGE.reach, d));
}

/**
 * The Northpass (shrine session D2): a cut through the northern mountains from the magic gate to the
 * camp, the second region of the overworld (docs/engine.md, "Regions"). `path` runs from the field in
 * front of the gate to the camp; the floor climbs from the field's level to `floor`, the walls rise
 * `wall` m above it and melt into the mountain by `reach`. The camp is a flat circle at the end.
 */
export const PASS = {
  path: [[8, -100], [8, -121], [9, -140], [3, -165], [-5, -195], [-10, -225], [-10, -255]] as [number, number][],
  floor: 12,
  halfWidth: 6.5,
  wallTop: 14,
  reach: 36,
  wall: 14,
  camp: { x: -10, z: -255, r: 17 },
};
const passLine = centerline(PASS.path);
export const PASS_LENGTH = passLine.length;
export const passPoint = passLine.point;

/** Distance from the pass's carved floor (the centerline, or the camp's circle) and how far along it the nearest point is. */
export function passFrame(x: number, z: number) {
  const { d, s } = passLine.frame(x, z);
  const dc = Math.max(0, Math.hypot(x - PASS.camp.x, z - PASS.camp.z) - (PASS.camp.r - PASS.halfWidth));
  return dc < d ? { d: dc, s: PASS_LENGTH } : { d, s };
}

/** True within `margin` meters of the pass's carved area (or inside it). */
export function inPass(x: number, z: number, margin = 0) {
  return passFrame(x, z).d < PASS.reach + margin || inBeyond(x, z, margin);
}

/** The pass floor's height `s` meters along: the field's level at the gate up to `floor` at the camp. */
export function passFloor(s: number) {
  const [mx, mz] = PASS.path[0];
  return mix(placementHeight(mx, mz), PASS.floor, smoothstep(0, PASS_LENGTH, s));
}

/**
 * The canyon beyond the camp (shrine session D3): a narrow cut north from the camp's middle, flat at the camp's
 * height, with a chasm across it (`pitFrom`..`pitTo`, `s` from the camp's centre). Wren crosses on rock pillars
 * (`world/overworld/camp.ts`); the Cragstalker and the Waybell wait on the far side.
 */
export const BEYOND = {
  path: [[-10, -255], [-10, -324]] as [number, number][],
  floor: 12,
  pitFrom: 21,
  pitTo: 41,
  pitDepth: 6,
  halfWidth: 4.5,
  wallTop: 10,
  reach: 26,
  wall: 11,
};
const beyondLine = centerline(BEYOND.path);
export const BEYOND_LENGTH = beyondLine.length;
export const beyondPoint = beyondLine.point;
export const beyondFrame = beyondLine.frame;

/** True within `margin` meters of the canyon's carved area (or inside it). */
export function inBeyond(x: number, z: number, margin = 0) {
  return beyondFrame(x, z).d < BEYOND.reach + margin;
}

/** The canyon cut into the land: never higher than the land it cuts through, flat inside the camp, a chasm across it. */
function carveBeyond(h: number, x: number, z: number) {
  const { d, s } = beyondFrame(x, z);
  if (d >= BEYOND.reach) return h;
  const pit = smoothstep(BEYOND.pitFrom, BEYOND.pitFrom + 3, s) * (1 - smoothstep(BEYOND.pitTo - 3, BEYOND.pitTo, s))
    * (1 - smoothstep(BEYOND.halfWidth - 1, BEYOND.halfWidth + 2, d));
  const floor = BEYOND.floor - BEYOND.pitDepth * pit;
  // The camp's own bowl is already walled; the canyon's walls start where the camp's flat ground ends.
  const wall = BEYOND.wall * smoothstep(BEYOND.halfWidth, BEYOND.wallTop, d) * smoothstep(10, 18, s);
  return Math.min(h, mix(floor + wall, h, smoothstep(BEYOND.wallTop, BEYOND.reach, d)));
}

/** The land with the pass cut into it (walls rise in the first 30 m so the gate stands between rock). */
function carvePass(h: number, x: number, z: number) {
  const { d, s } = passFrame(x, z);
  if (d >= PASS.reach) return h;
  const wall = PASS.wall * smoothstep(PASS.halfWidth, PASS.wallTop, d) * smoothstep(8, 30, s);
  return mix(passFloor(s) + wall, h, smoothstep(PASS.wallTop, PASS.reach, d));
}

export function riverZ(x: number) {
  return 66 + 16 * Math.sin(x * 0.022) + 6 * Math.sin(x * 0.061 + 1);
}

export const BRIDGE = { x: -14, z: riverZ(-14), halfLen: 13, halfW: 2.2 };

/** Height of the bridge deck along its length (an arch). */
export function bridgeDeck(z: number) {
  return 0.5 + Math.cos(((z - BRIDGE.z) / BRIDGE.halfLen) * (Math.PI / 2));
}

/** The door of the shrine, on the west face of the shrine house. */
/** The doorway's plane: the pillars and lintel in `buildShrine` stand at SHRINE.x - 3.6; the door sits in it. */
export const SHRINE_DOOR = { x: SHRINE.x - 3.6, z: SHRINE.z };

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
  let withHollow = mix(h, HOLLOW.floor, smoothstep(HOLLOW.r + 9, HOLLOW.r, Math.hypot(x - HOLLOW.x, z - HOLLOW.z)));
  // Each ruin sits on a level pad at its center's height, easing back into the land 6 m out.
  for (const r of RUINS) withHollow = mix(withHollow, placementHeight(r.x, r.z), smoothstep(r.r + 6, r.r, Math.hypot(x - r.x, z - r.z)));
  return carveBeyond(raiseGateShoulders(carvePass(carveGorge(withHollow, x, z), x, z), x, z), x, z);
}

/** The gate's pillars stand 5 m either side of its middle, each 1.7 m wide: the outer faces are at this offset. */
const GATE_PILLAR_EDGE = GATE.halfOpening + 0.8 + 0.85;
/** How high the rock shoulders beside the gate rise. */
const SHOULDER_RISE = 9;

/**
 * Rock shoulders hugging the gate's pillars (owner's call, 2026-11-03: no person-wide gaps beside it). Steep
 * outcrops start right at each pillar's outer face and reach `SHOULDER_RISE` within a couple of metres, then ease
 * back into the land by ~17 m out. They taper away toward the field to the south (the sign stands clear of them)
 * and fade into the pass's own walls to the north.
 */
function raiseGateShoulders(h: number, x: number, z: number) {
  const a = Math.abs(x - GATE.x) - GATE_PILLAR_EDGE;
  if (a > 17 || a < -1.2) return h;
  const dz = z - GATE.z;
  const along = dz > 0 ? 1 - smoothstep(2, 10, dz) : 1 - smoothstep(4, 14, -dz);
  if (along <= 0) return h;
  return h + SHOULDER_RISE * smoothstep(-1.2, 2, a) * (1 - smoothstep(5, 17, a)) * along;
}

/** True within `margin` meters of the hollow's edge (or inside it). */
export function inHollow(x: number, z: number, margin = 0) {
  return Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.r + margin;
}

/**
 * Ruined homes across the valley, left by the blight (world/overworld/ruins.ts builds them). Each faces
 * `yaw` (its open front, local +z); `r` covers its footprint. The shield's cottage stands north of
 * Thistledown, in line with the fence's north gap: hidden behind the houses from the road in, in plain
 * view on the way out (owner's call, 2026-11-03).
 */
export const RUINS = [
  { id: 'shieldCottage', x: VILLAGE.x + 2, z: VILLAGE.z - 39, yaw: Math.atan2(-2, 39), r: 5.5, scale: 1, flip: 1, jars: ['empty', 'bluegem', 'heart', 'empty'] },
  // Thistledown's two ruined homes, on the northeast and northwest of the ring (the intact ones are east and southwest).
  { id: 'ringNortheast', ...ringHome(-1.2), r: 7, scale: 1.3, flip: -1, jars: ['empty', 'heart', 'empty', 'bluegem', 'empty'] },
  { id: 'ringNorthwest', ...ringHome(-2.2), r: 7, scale: 1.3, flip: 1, jars: ['heart', 'empty', 'empty', 'bluegem', 'empty'] },
  // Out in the valley, each a short walk off a road or a shore.
  { id: 'roadsideHome', x: 12, z: 38, yaw: Math.atan2(-20, -3), r: 6, scale: 1.15, flip: -1, jars: ['empty', 'bluegem', 'heart', 'empty', 'heart'] },
  // Pip's old home: her doll waits in the sixth jar (appended, so the saved `jar.lakeHome.<i>` flags keep their jars).
  { id: 'lakeHome', x: -60, z: 98, yaw: Math.atan2(-40, 2), r: 6, scale: 1.2, flip: 1, jars: ['heart', 'empty', 'bluegem', 'empty', 'heart', 'doll'] },
  { id: 'gateHome', x: 20, z: -95, yaw: Math.atan2(10, 35), r: 6, scale: 1.1, flip: -1, jars: ['empty', 'heart', 'bluegem', 'heart', 'empty'] },
] as const;

/** A home on the village ring (radius 17 from the square, angle `a`), its door facing the well. */
function ringHome(a: number) {
  const x = VILLAGE.x + Math.cos(a) * 17, z = VILLAGE.z + Math.sin(a) * 17;
  return { x, z, yaw: Math.atan2(VILLAGE.x - x, VILLAGE.z - z) };
}

/** True within `margin` meters of a ruin's footprint (scenery stays clear, without reshuffling). */
export function inRuin(x: number, z: number, margin = 0) {
  return RUINS.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + margin);
}

/** True within `margin` meters of the gate's arch and the ground just before it (scenery stays clear). */
export function inGate(x: number, z: number, margin = 0) {
  return Math.abs(x - GATE.x) < GATE.halfOpening + 3 + margin && Math.abs(z - GATE.z) < 7 + margin;
}

/**
 * Where Thistledown's own song plays (day and night) and its name shows: well past the fence, out to the mill's
 * fields, and up the north path to the shield's cottage, so it carries Wren in and out of town.
 */
export function inVillageMusic(x: number, z: number) {
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 16) return true;
  const c = RUINS[0];
  return Math.hypot(x - c.x, z - c.z) < 16;
}

/** The village is safe ground: field enemies never step in, and give up a chase once Wren is inside. */
export function inVillageGuard(x: number, z: number) {
  return Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 6;
}

/** On a village doorstep or the well's footing, where no grass may grow through. */
export function onVillageStep(x: number, z: number) {
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 3.4) return true; // the well's paved apron
  if (Math.hypot(x - MILL.x, z - MILL.z) < MILL_TOWER.outer + 0.3) return true; // the mill's room
  if (Math.hypot(x - (MILL.x + MILL_TOWER.outer + 0.4), z - MILL.z) < 2.4) return true;
  // Each home's door is 4.5 m in from its middle, toward the well.
  return HOMES.some((h) => Math.hypot(x - (VILLAGE.x + Math.cos(h.a) * 12.5), z - (VILLAGE.z + Math.sin(h.a) * 12.5)) < 2.4);
}

/** Which named place a point is in (shown as a title when you walk in). */
export function areaNameAt(x: number, z: number) {
  if (inVillageMusic(x, z)) return 'Thistledown Village'; // the same ground the village song covers
  if (Math.hypot(x - GROVE.x, z - GROVE.z) < 36) return 'The Whispering Grove';
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 28) return 'The Waking Shrine';
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 38) return 'Glimmer Lake';
  if (inHollow(x, z, 3)) return 'Gloaming Hollow';
  if (gorgeFrame(x, z).d < GORGE.wallTop) return 'The Hushing Gorge';
  if (Math.hypot(x - PASS.camp.x, z - PASS.camp.z) < PASS.camp.r - 4) return 'Wayfarers\' Camp';
  if ((passFrame(x, z).d < PASS.wallTop && z < GATE.z) || beyondFrame(x, z).d < BEYOND.wallTop) return 'The Northpass';
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
  if (inHollow(x, z, 12) || inGorge(x, z, 6) || inPass(x, z, 6)) return false;
  return true;
}
