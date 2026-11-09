import { buildRuin as buildRuinHome, RUIN_WALL_T, RUIN_WALLS } from '../../render/models/ruins';
import type { AreaBuilder } from '../area';
import { JarField, type JarSpot } from '../jars';
import { ShieldPickup } from '../objects';
import { RUINS, terrainHeight } from './layout';

/** Where a ruin's local point (front = +z) lands in the world. */
function toWorld(ruin: { x: number; z: number; yaw: number }, lx: number, lz: number) {
  const c = Math.cos(ruin.yaw), s = Math.sin(ruin.yaw);
  return { x: ruin.x + lx * c + lz * s, z: ruin.z - lx * s + lz * c };
}

type Ruin = (typeof RUINS)[number];

/** Where jars stand in a ruin's local frame (scale 1, unflipped), and whether the spot is inside the walls. */
const JAR_SPOTS: [number, number, boolean][] = [
  [2.8, 0.5, true], [-0.2, -1.2, true], [-3.0, 2.2, true], [4.3, 1.4, false], [-4.0, 3.6, false], [1.0, -3.9, false],
];

/**
 * The ruined homes (`RUINS`): broken stone walls at uneven heights, a fallen roof, charred
 * rafters and rubble. Every ruin shares one plan (a 7 x 6 m shell, tallest at the back, the front
 * broken down low, a breach in one side, the roof fallen on the other); `scale` grows it, `flip`
 * mirrors it so neighbors don't look alike. Each holds a few jars (`jars`: what they hold).
 * Only the shield's cottage hides the shield, leaning on the back wall where it shows through
 * the doorway and over the low front wall.
 */
export function buildRuins(b: AreaBuilder) {
  const jars: JarSpot[] = [];
  let shield!: ShieldPickup;
  for (const ruin of RUINS) {
    jars.push(...buildRuin(b, ruin));
    if (ruin.id === 'shieldCottage') shield = new ShieldPickup(b, ...shieldSpot(ruin), ruin.yaw);
  }
  return { shield, jars: new JarField(b, jars) };
}

/** Where a ruin's local point (front = +z, scaled and mirrored) lands in the world. */
function place(ruin: Ruin, lx: number, lz: number) {
  return toWorld(ruin, lx * ruin.flip * ruin.scale, lz * ruin.scale);
}

function groundY(ruin: Ruin) {
  const corners = [[0, 0], [-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]].map(([lx, lz]) => place(ruin, lx, lz));
  return Math.max(...corners.map((p) => terrainHeight(p.x, p.z)));
}

function shieldSpot(ruin: Ruin): [number, number, number] {
  const at = place(ruin, 1.0, -2.45);
  return [at.x, groundY(ruin) + 0.12, at.z];
}

function buildRuin(b: AreaBuilder, ruin: Ruin): JarSpot[] {
  const { scale: s } = ruin;
  const y = groundY(ruin);
  // What it looks like is the final model (render/models/ruins.ts); the colliders below are measured from the same wall list.
  const model = buildRuinHome(s, ruin.flip).root;
  model.position.set(ruin.x, y, ruin.z);
  model.rotation.y = ruin.yaw;
  b.staticGroup.add(model);

  for (const [ax, az, bx, bz, h] of RUIN_WALLS) {
    const len = Math.hypot(bx - ax, bz - az) * s;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [w, d] = along ? [len, RUIN_WALL_T] : [RUIN_WALL_T, len];
    const p = place(ruin, (ax + bx) / 2, (az + bz) / 2);
    b.box(p.x, y + h / 2, p.z, w / 2, h / 2 + 0.3, d / 2, ruin.yaw);
  }
  // The roof came down on the west side: its slab leans off the west wall onto the floor.
  const under = place(ruin, -2.4, -0.6);
  b.box(under.x, y + 0.8, under.z, 1.0 * s, 0.8, 2.4 * s, ruin.yaw);

  return ruin.jars.map((drop, i) => {
    const [lx, lz, inside] = JAR_SPOTS[i];
    const p = place(ruin, lx, lz);
    return { id: `${ruin.id}.${i}`, x: p.x, y: inside ? y + 0.12 : terrainHeight(p.x, p.z), z: p.z, drop };
  });
}
