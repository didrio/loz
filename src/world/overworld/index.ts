import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import type { Physics } from '../../core/physics';
import { AreaBuilder, type Area, type AreaEnv, type Interactable, type Trigger } from '../area';
import { BossArena, BushField, Chest, GreatLantern, HeartVessel, Npc, StoneDoor } from '../objects';
import { buildHollow } from './hollow';
import { buildBridge, buildGrove, buildShrine, buildSign, SIGNS } from './landmarks';
import { areaNameAt, GROVE, HOLLOW, isEnemyGround, SHRINE_DOOR, SPAWN, terrainHeight, VILLAGE, WATER_Y } from './layout';
import { buildGrass, buildRocks, buildTrees, bushSpots } from './nature';
import { buildBounds, buildTerrain, buildWater } from './terrain';
import { buildVillage } from './village';

/**
 * Emberfield, the valley at the center of the game: the field, Thistledown Village, the
 * Whispering Grove and the Waking Shrine. Built entirely from primitives with a fixed seed,
 * so it's identical on every load.
 */
export class Overworld implements Area {
  readonly id = 'overworld';
  readonly root: THREE.Group;
  readonly spawn = SPAWN;
  readonly waterLevel = WATER_Y;
  readonly enemyCount = 14;
  readonly interactables: Interactable[];
  readonly triggers: Trigger[];
  readonly npcs: { maren: Npc; tobin: Npc };
  readonly chest: Chest;
  readonly door: StoneDoor;
  /** The great lantern atop the shrine (lights up as embers return). */
  readonly lantern: GreatLantern;
  /** The Lamplighter's arena in Gloaming Hollow, and the heart vessel it leaves behind. */
  readonly hollow: BossArena;
  readonly vessel: HeartVessel;
  private readonly hollowFx: { update(dt: number): void };
  private readonly bushes: BushField;
  private readonly water: THREE.Mesh;
  private readonly blades: THREE.Group;
  private readonly shaft: THREE.Mesh;
  private readonly windowMat: THREE.MeshLambertMaterial;
  private readonly lanternMat: THREE.MeshBasicMaterial;
  private readonly disposer: () => void;
  private t = 0;

  constructor(physics: Physics) {
    const b = new AreaBuilder(physics, mulberry32(1337));
    buildTerrain(b);
    this.water = buildWater(b);
    buildBounds(b);
    buildBridge(b);
    const village = buildVillage(b);
    this.windowMat = village.windowMat;
    this.lanternMat = village.lanternMat;
    this.blades = village.blades;
    this.shaft = buildGrove(b);
    const shrine = buildShrine(b);
    this.lantern = shrine.lantern;
    buildTrees(b);
    buildRocks(b);
    buildGrass(b);
    // The hollow is built after the seeded scenery and uses its own RNG (see layout.ts).
    const hollow = buildHollow(b);
    this.hollowFx = hollow;
    this.bushes = new BushField(b, [...bushSpots(b), ...hollow.bushes]);
    for (const s of SIGNS) buildSign(b, s.x, s.z);
    this.hollow = new BossArena(b, HOLLOW.x, HOLLOW.z, HOLLOW.floor, HOLLOW.r, hollow.lamps);
    this.vessel = new HeartVessel(b, HOLLOW.x, HOLLOW.floor, HOLLOW.z);

    const npc = (x: number, z: number, yaw: number, scale: number, colors: ConstructorParameters<typeof Npc>[1]) =>
      new Npc(b, colors, x, z, terrainHeight(x, z), yaw, scale);
    this.npcs = {
      maren: npc(VILLAGE.x + 3.5, VILLAGE.z + 2.5, Math.PI * 0.25, 0.94,
        { skin: 0xe8b98f, hair: 0xc9c3b8, coat: 0x6b4c8a, pants: 0x3b3040, boots: 0x3a2a1e, accent: 0xd9a531 }),
      tobin: npc(VILLAGE.x - 17, VILLAGE.z + 4, Math.PI / 2, 1.06,
        { skin: 0xd99a6c, hair: 0xb8662a, coat: 0x8a6b3a, pants: 0x4a3a2a, boots: 0x2e2018, accent: 0xe8dfc4 }),
    };
    this.chest = new Chest(b, GROVE.x, GROVE.z, terrainHeight(GROVE.x, GROVE.z), Math.atan2(-6, 6));
    this.door = new StoneDoor(b, SHRINE_DOOR.x, SHRINE_DOOR.z, terrainHeight(SHRINE_DOOR.x, SHRINE_DOOR.z));

    const always = () => true;
    this.interactables = [
      { id: 'npc.maren', x: this.npcs.maren.x, z: this.npcs.maren.z, r: 2.6, label: 'Talk', enabled: always },
      { id: 'npc.tobin', x: this.npcs.tobin.x, z: this.npcs.tobin.z, r: 2.6, label: 'Talk', enabled: always },
      { id: 'chest.grove', x: GROVE.x, z: GROVE.z, r: 2.4, label: 'Open', enabled: () => !this.chest.opened },
      { id: 'door.shrine', x: SHRINE_DOOR.x - 1.2, z: SHRINE_DOOR.z, r: 3, label: 'Check', enabled: () => !this.door.opening },
      { id: 'sign.pedestal', x: shrine.pedestal.x, z: shrine.pedestal.z, r: 2.3, label: 'Read', enabled: always },
      ...SIGNS.map((s) => ({ id: s.id, x: s.x, z: s.z, r: 2.3, label: 'Read', enabled: always })),
    ];
    this.triggers = [
      { id: 'trigger.shrineEntrance', x: SHRINE_DOOR.x, z: SHRINE_DOOR.z, r: 1.6, enabled: () => this.door.open },
      // Walking into the hollow wakes the Lamplighter (when content has armed the arena).
      { id: 'trigger.hollow', x: HOLLOW.x, z: HOLLOW.z, r: HOLLOW.r - 2, enabled: () => this.hollow.armed && !this.hollow.sealed },
      { id: 'trigger.heartVessel', x: this.vessel.x, z: this.vessel.z, r: 1.3, enabled: () => this.vessel.visible },
    ];

    const done = b.finish();
    this.root = done.root;
    this.disposer = done.dispose;
  }

  nameAt(x: number, z: number) {
    return areaNameAt(x, z);
  }

  enemySpot(rand: () => number, near?: THREE.Vector3, minDist = 0, maxDist = Infinity) {
    for (let i = 0; i < 200; i++) {
      let x: number, z: number;
      if (near && maxDist < Infinity) {
        const a = rand() * Math.PI * 2, r = minDist + rand() * (maxDist - minDist);
        x = near.x + Math.cos(a) * r;
        z = near.z + Math.sin(a) * r;
      } else {
        x = (rand() - 0.5) * 260;
        z = (rand() - 0.5) * 260;
      }
      if (!isEnemyGround(x, z)) continue;
      if (near && Math.hypot(x - near.x, z - near.z) < minDist) continue;
      return { x, z };
    }
    return null;
  }

  cut(x: number, z: number, dirX: number, dirZ: number, reach: number) {
    return this.bushes.cut(x, z, dirX, dirZ, reach);
  }

  update(dt: number, env: AreaEnv) {
    const { night } = env;
    this.t += dt;
    this.blades.rotation.x += dt * 0.6;
    this.water.position.y = WATER_Y + Math.sin(this.t * 0.8) * 0.05;
    this.windowMat.emissive.setRGB(0.9 * night, 0.6 * night, 0.25 * night);
    this.lanternMat.color.setRGB(0.4 + 0.6 * night, 0.27 + 0.5 * night, 0.13 + 0.2 * night);
    (this.shaft.material as THREE.MeshBasicMaterial).opacity = 0.1 * (1 - night) + Math.sin(this.t) * 0.02;
    this.chest.update(dt);
    this.door.update(dt);
    this.lantern.update(dt);
    this.hollow.update(dt);
    this.vessel.update(dt);
    this.hollowFx.update(dt);
    this.bushes.update(dt);
    this.npcs.maren.update(dt, env.playerPos);
    this.npcs.tobin.update(dt, env.playerPos);
  }

  dispose() {
    this.disposer();
  }
}
