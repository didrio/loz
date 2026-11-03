import * as THREE from 'three';
import type { Physics } from '../../core/physics';
import { AreaBuilder, type Area, type AreaEnv, type Interactable, type Trigger } from '../area';
import { BellPickup, BellPost, type BellId } from '../bell';
import { BossArena, BushField, Chest, GreatLantern, HeartVessel, Npc, ShieldPickup, StoneDoor } from '../objects';
import { buildCamp, CANYON_COURSE, WAYBELL_PICKUP } from './camp';
import { Gate } from './gate';
import { buildGorge, GORGE_BELL, GORGE_COURSE, gorgeAt } from './gorge';
import { buildHollow } from './hollow';
import { MurmurbudLook } from '../murmurbud';
import { buildBridge, buildGrove, buildShrine, buildSign, SIGNS } from './landmarks';
import { areaNameAt, BUDS, GATE, GROVE, regionRng, HOLLOW, isEnemyGround, MILL, MORROW_POST, SHRINE_DOOR, STALL, SPAWN, terrainHeight, VILLAGE, WATER_Y } from './layout';
import { NORTHPASS } from './northpass';
import { RegionStreamer } from './region';
import { buildGrass, buildRocks, buildTrees, bushSpots } from './nature';
import { buildRuins } from './ruins';
import { buildBlightGrowths } from './blight';
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
  /** Where Wren arrives from elsewhere: just outside the shrine door, facing away from it. */
  readonly entrances: Record<string, { x: number; z: number; facing: number }> = {
    shrineDoor: { x: SHRINE_DOOR.x - 3.5, z: SHRINE_DOOR.z, facing: -Math.PI / 2 },
    /** On the square in front of the mill door, facing away from it. */
    mill: { x: MILL.x + 4.4, z: MILL.z, facing: Math.PI / 2 },
    /** In front of the magic gate, facing it: where the seal-stone's vision cuts to. */
    gateView: { x: GATE.x, z: GATE.z + 15, facing: Math.PI },
  };
  /** The Morrowbell's post on Thistledown's square. */
  readonly morrowPost: BellPost;
  readonly bellPosts: Map<BellId, BellPost>;
  /** The Morrowbell waiting at the end of the Hushing Gorge. */
  readonly morrowBell: BellPickup;
  /** The gorge's climb (tests and smoke read the pillars from here). */
  readonly gorgeCourse = GORGE_COURSE;
  /** A point on the gorge (`s` m in, `lat` m left of its centerline): for look scenes. */
  readonly gorgeAt = gorgeAt;
  /** The Waybell's post at Wayfarers' Camp, and the bell waiting across the canyon. */
  readonly wayPost: BellPost;
  readonly wayBell: BellPickup;
  /** The canyon's crossing (tests and smoke read the ledges from here). */
  readonly canyonCourse = CANYON_COURSE;
  private readonly canyonCrossing: { update(t: number): void; dispose(): void };
  private readonly gorgeClimb: { update(t: number): void; dispose(): void };
  private platformT = 0;
  readonly interactables: Interactable[];
  readonly triggers: Trigger[];
  readonly npcs: { maren: Npc; tobin: Npc; odo: Npc; lark: Npc };
  readonly chest: Chest;
  readonly door: StoneDoor;
  /** The shield in the ruined cottage north of Thistledown (Wren starts without it). */
  readonly shield: ShieldPickup;
  /** The magic gate at the Northpass (shut until the Keepers' seal is broken). */
  readonly gate: Gate;
  /** The great lantern atop the shrine (lights up as embers return). */
  readonly lantern: GreatLantern;
  /** The Lamplighter's arena in Gloaming Hollow, and the heart vessel it leaves behind. */
  readonly hollow: BossArena;
  readonly vessel: HeartVessel;
  private readonly hollowFx: { update(dt: number): void };
  private readonly bushes: BushField;
  /** The blight's thorns in the field; they shrink away as the blight lifts. */
  private readonly growths: ReturnType<typeof buildBlightGrowths>;
  /** The Murmurbuds, by id (`bud.<hint>`). */
  readonly buds: Map<string, MurmurbudLook>;
  /** A swing reached a bud (the game's bud system listens; see game/buds.ts). */
  onBudStrike: ((id: string) => void) | null = null;
  private readonly water: THREE.Mesh;
  private readonly blades: THREE.Group;
  private readonly windowMat: THREE.MeshLambertMaterial;
  private readonly lanternMat: THREE.MeshBasicMaterial;
  private readonly disposer: () => void;
  /** The regions beyond the valley (the Northpass), built and dropped by distance. */
  private readonly regions: RegionStreamer;
  private t = 0;

  constructor(physics: Physics) {
    const b = new AreaBuilder(physics, regionRng('valley'));
    buildTerrain(b);
    this.water = buildWater(b);
    buildBounds(b);
    buildBridge(b);
    const village = buildVillage(b);
    this.windowMat = village.windowMat;
    this.lanternMat = village.lanternMat;
    this.blades = village.blades;
    buildGrove(b);
    const shrine = buildShrine(b);
    this.lantern = shrine.lantern;
    buildTrees(b);
    this.gate = new Gate(b);
    buildRocks(b);
    buildGrass(b);
    // The hollow is built after the seeded scenery and uses its own RNG (see layout.ts).
    const hollow = buildHollow(b);
    this.hollowFx = hollow;
    const gorge = buildGorge(b);
    this.gorgeClimb = gorge.course;
    this.morrowBell = gorge.bell;
    const camp = buildCamp(b);
    this.wayPost = camp.post;
    this.wayBell = camp.bell;
    this.canyonCrossing = camp.course;
    this.shield = buildRuins(b).shield;
    this.growths = buildBlightGrowths(b, regionRng('blight'));
    this.bushes = new BushField(b, [...bushSpots(b), ...hollow.bushes]);
    this.buds = new Map(BUDS.map(({ id, x, z }) => [id, new MurmurbudLook(b, id, x, terrainHeight(x, z), z)]));
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
      // Behind his counter, facing east to the square.
      odo: npc(STALL.x - 1.3, STALL.z, Math.PI / 2, 1.0,
        { skin: 0xc98a5e, hair: 0x2e2a28, coat: 0x3f6f8a, pants: 0x3a3a48, boots: 0x2e2018, accent: 0xd9a531 }),
      // A small kid on the far side of the well from Maren, facing the square (shield surfing).
      lark: npc(VILLAGE.x - 3, VILLAGE.z + 4.5, Math.PI * 0.8, 0.66,
        { skin: 0xf0c49a, hair: 0x7a4a24, coat: 0x5e8a4a, pants: 0x6b5a3a, boots: 0x3a2a1e, accent: 0xe0b84a }),
    };
    // Its front faces down the grove road (which arrives from the southwest), locked until
    // Maren hands over the key.
    this.chest = new Chest(b, GROVE.x, GROVE.z, terrainHeight(GROVE.x, GROVE.z), Math.atan2(-6, 6), true);
    this.door = new StoneDoor(b, SHRINE_DOOR.x, SHRINE_DOOR.z, terrainHeight(SHRINE_DOOR.x, SHRINE_DOOR.z));
    // Facing the well, so it's in view from the square.
    const morrow = new BellPost(b, 'morrow', MORROW_POST.x, terrainHeight(MORROW_POST.x, MORROW_POST.z), MORROW_POST.z, Math.atan2(VILLAGE.x - MORROW_POST.x, VILLAGE.z - MORROW_POST.z));
    b.dynamic(morrow.group);
    this.morrowPost = morrow;
    this.bellPosts = new Map([['morrow', morrow], ['way', this.wayPost]]);
    this.entrances['bell.morrow'] = morrow.arrival();
    this.entrances['bell.way'] = this.wayPost.arrival();

    const always = () => true;
    /** The prompt floats this high above the ground at a spot. */
    const above = (x: number, z: number, h: number) => terrainHeight(x, z) + h;
    const door = this.door;
    const way = this.wayPost;
    this.interactables = [
      { id: 'npc.maren', x: this.npcs.maren.x, z: this.npcs.maren.z, r: 2.6, label: 'Talk', promptY: above(this.npcs.maren.x, this.npcs.maren.z, 2.5), enabled: always },
      { id: 'npc.tobin', x: this.npcs.tobin.x, z: this.npcs.tobin.z, r: 2.6, label: 'Talk', promptY: above(this.npcs.tobin.x, this.npcs.tobin.z, 2.6), enabled: always },
      { id: 'npc.lark', x: this.npcs.lark.x, z: this.npcs.lark.z, r: 2.2, label: 'Talk', promptY: above(this.npcs.lark.x, this.npcs.lark.z, 1.9), enabled: always },
      { id: 'npc.odo', x: STALL.x + 1.2, z: STALL.z, r: 2.4, label: 'Talk', promptY: above(STALL.x, STALL.z, 2.7), enabled: always },
      { id: 'door.mill', x: MILL.x + 3.3, z: MILL.z, r: 1.7, label: 'Enter', promptY: above(MILL.x + 2.6, MILL.z, 2.2), enabled: always },
      { id: 'pickup.shield', x: this.shield.x, z: this.shield.z, r: 2.2, label: 'Take', promptY: this.shield.y + 1.6, enabled: () => this.shield.present },
      { id: 'chest.grove', x: GROVE.x, z: GROVE.z, r: 2.4, label: 'Open', promptY: above(GROVE.x, GROVE.z, 1.9), enabled: () => !this.chest.opened },
      {
        id: 'door.shrine', x: SHRINE_DOOR.x - 1.2, z: SHRINE_DOOR.z, r: 3, promptY: above(SHRINE_DOOR.x, SHRINE_DOOR.z, 3.4),
        get label() { return door.awake ? 'Open' : 'Check'; },
        enabled: () => !door.opening,
      },
      { id: 'bellPost.morrow', x: morrow.front.x, z: morrow.front.z, r: 2.2, get label() { return morrow.label; }, promptY: morrow.y + 3.2, enabled: () => !morrow.hanging },
      { id: 'bellPickup.morrow', x: GORGE_BELL.x, z: GORGE_BELL.z, y: GORGE_BELL.y, r: 2, label: 'Take', promptY: GORGE_BELL.y + 2.2, enabled: () => this.morrowBell.present },
      { id: 'bellPost.way', x: this.wayPost.front.x, z: this.wayPost.front.z, r: 2.2, get label() { return way.label; }, promptY: way.y + 3.2, enabled: () => !way.hanging },
      { id: 'bellPickup.way', x: WAYBELL_PICKUP.x, z: WAYBELL_PICKUP.z, y: WAYBELL_PICKUP.y, r: 2, label: 'Take', promptY: WAYBELL_PICKUP.y + 2.2, enabled: () => this.wayBell.present },
      { id: 'sign.pedestal', x: shrine.pedestal.x, z: shrine.pedestal.z, r: 2.3, label: 'Read', promptY: above(shrine.pedestal.x, shrine.pedestal.z, 2), enabled: always },
      ...SIGNS.map((s) => ({ id: s.id, x: s.x, z: s.z, r: 2.3, label: 'Read', promptY: above(s.x, s.z, 2.4), enabled: always })),
      ...[...this.buds.values()].map((bud) => bud.interactable),
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
    this.regions = new RegionStreamer([NORTHPASS], physics, this);
  }

  /** The sky's blight level, 0–1 (the game feeds it every frame). */
  setBlight(level: number) {
    this.growths.setLevel(level);
  }

  streamAt(x: number, z: number) {
    this.regions.streamAt(x, z);
  }

  /** Which regions are built right now (tests). */
  get loadedRegions() {
    return this.regions.loadedIds;
  }

  nameAt(x: number, z: number) {
    return areaNameAt(x, z);
  }

  /** Thistledown has its own (simpler) theme by day; at night the valley shares one. */
  musicAt(x: number, z: number, night: boolean) {
    return !night && areaNameAt(x, z) === 'Thistledown Village' ? 'village' as const : undefined;
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

  strike(x: number, y: number, z: number, dirX: number, dirZ: number, reach: number) {
    for (const bud of this.buds.values()) if (bud.inReach(x, y, z, dirX, dirZ, reach)) this.onBudStrike?.(bud.id);
  }

  movePlatforms(dt: number) {
    this.platformT += dt;
    this.gorgeClimb.update(this.platformT);
    this.canyonCrossing.update(this.platformT);
  }

  update(dt: number, env: AreaEnv) {
    const { night } = env;
    this.t += dt;
    this.blades.rotation.x += dt * 0.6;
    this.water.position.y = WATER_Y + Math.sin(this.t * 0.8) * 0.05;
    this.windowMat.emissive.setRGB(0.9 * night, 0.6 * night, 0.25 * night);
    this.lanternMat.color.setRGB(0.4 + 0.6 * night, 0.27 + 0.5 * night, 0.13 + 0.2 * night);
    this.chest.update(dt);
    this.door.update(dt);
    this.lantern.update(dt);
    this.gate.update(dt);
    this.hollow.update(dt);
    this.vessel.update(dt);
    this.shield.update(dt);
    this.morrowPost.update(dt);
    this.morrowBell.update(dt);
    this.wayPost.update(dt);
    this.wayBell.update(dt);
    this.hollowFx.update(dt);
    this.bushes.update(dt);
    for (const bud of this.buds.values()) bud.update(dt);
    this.regions.update(dt);
    this.npcs.maren.update(dt, env.playerPos);
    this.npcs.tobin.update(dt, env.playerPos);
    this.npcs.odo.update(dt, env.playerPos);
    this.npcs.lark.update(dt, env.playerPos);
  }

  dispose() {
    this.regions.dispose();
    this.gorgeClimb.dispose();
    this.canyonCrossing.dispose();
    this.disposer();
  }
}
