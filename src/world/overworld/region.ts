import type * as THREE from 'three';
import type { Physics } from '../../core/physics';
import type { Interactable, Trigger } from '../area';
import type { TerrainRect } from './terrain';

/** What a loaded region hands back: its meshes, what can be interacted with, and how to take it all away. */
export interface BuiltRegion {
  readonly root: THREE.Group;
  readonly interactables?: Interactable[];
  readonly triggers?: Trigger[];
  /** Every frame; `night` is 0 by day, 1 at night (a town's windows and lanterns glow). */
  update?(dt: number, night: number): void;
  dispose(): void;
}

/** A part of the overworld that exists only while Wren is near it (docs/engine.md, "Regions"). */
export interface RegionDef {
  readonly id: string;
  /** The ground it covers: it loads and unloads by distance to this rectangle. */
  readonly rect: TerrainRect;
  /** Overrides `LOAD_DIST` / `UNLOAD_DIST`: a region that can be seen from far away loads where the fog still hides it. */
  readonly loadDist?: number;
  readonly unloadDist?: number;
  /** Its water surface, m. Inside its rectangle this replaces the valley's; omitted: no water there. */
  readonly waterLevel?: number;
  /**
   * Builds it. A big region is a generator: it `yield`s between steps (a strip of terrain, a kind of scenery), and
   * the streamer runs one step a frame from `loadDist` on, so its build never stalls a frame.
   */
  build(physics: Physics): BuiltRegion | Generator<void, BuiltRegion, void>;
}

/** By default a region loads when Wren is within this many meters of its rectangle and drops past `UNLOAD_DIST`. */
export const LOAD_DIST = 70;
export const UNLOAD_DIST = 110;
/** Nearer than this to a region still being built, the rest of its build runs at once (a teleport, a save, a bell). */
export const FINISH_DIST = 30;

/** How a region's last build went (the look scene reports it): its steps and the slowest one, ms. */
export interface BuildStats { steps: number; slowestMs: number; totalMs: number }

/** Meters from (x, z) to the rectangle (0 inside it). */
export function distToRect(r: TerrainRect, x: number, z: number) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}

/**
 * Builds and drops regions as Wren moves. A plain region is built in one go (it appears behind a mountain
 * well before she can see it); a generator one a step per frame, and appears when it's done. Its
 * interactables and triggers join the host area's lists while it is loaded. The hysteresis between the
 * two distances stops a region flickering at the edge.
 */
export class RegionStreamer {
  private readonly loaded = new Map<string, BuiltRegion>();
  private readonly pending = new Map<string, Generator<void, BuiltRegion, void>>();
  readonly buildStats: Record<string, BuildStats> = {};

  constructor(
    private readonly defs: readonly RegionDef[],
    private readonly physics: Physics,
    private readonly host: { root: THREE.Group; interactables: Interactable[]; triggers: Trigger[] },
  ) {}

  get loadedIds() {
    return [...this.loaded.keys()];
  }

  /** The water level of the region whose rectangle holds (x, z): its own, or null if it has none. undefined: no region there. */
  waterAt(x: number, z: number): number | null | undefined {
    const def = this.defs.find((d) => distToRect(d.rect, x, z) === 0);
    return def && (def.waterLevel ?? null);
  }

  /**
   * Loads what is near (x, z) and unloads what is far. Within `FINISH_DIST` of a region its colliders are
   * ready when this returns; further out a generator region may still be building (`update` steps it).
   */
  streamAt(x: number, z: number) {
    let changed = false;
    for (const def of this.defs) {
      const d = distToRect(def.rect, x, z);
      const region = this.loaded.get(def.id);
      if (!region && !this.pending.has(def.id) && d < (def.loadDist ?? LOAD_DIST)) {
        this.start(def);
        changed = true;
      } else if (region && d > (def.unloadDist ?? UNLOAD_DIST)) {
        this.unload(def.id);
      }
      if (this.pending.has(def.id) && d < FINISH_DIST) {
        while (!this.step(def.id));
        changed = true;
      }
    }
    if (changed) this.physics.refreshQueries();
  }

  /** Steps each region still being built (one step each), then runs the loaded ones. */
  update(dt: number, night = 0) {
    let done = false;
    for (const id of [...this.pending.keys()]) done = this.step(id) || done;
    if (done) this.physics.refreshQueries();
    for (const r of this.loaded.values()) r.update?.(dt, night);
  }

  dispose() {
    for (const id of [...this.pending.keys()]) while (!this.step(id));
    for (const id of [...this.loaded.keys()]) this.unload(id);
  }

  private start(def: RegionDef) {
    const t0 = performance.now();
    const r = def.build(this.physics);
    this.buildStats[def.id] = { steps: 1, slowestMs: performance.now() - t0, totalMs: performance.now() - t0 };
    if ('next' in r) this.pending.set(def.id, r);
    else this.attach(def.id, r);
  }

  /** Runs one step of a pending build; true once it's done and attached. */
  private step(id: string) {
    const gen = this.pending.get(id)!;
    const t0 = performance.now();
    const next = gen.next();
    const ms = performance.now() - t0, stats = this.buildStats[id];
    stats.steps++;
    stats.totalMs += ms;
    stats.slowestMs = Math.max(stats.slowestMs, ms);
    if (!next.done) return false;
    this.pending.delete(id);
    this.attach(id, next.value);
    return true;
  }

  private attach(id: string, r: BuiltRegion) {
    this.loaded.set(id, r);
    this.host.root.add(r.root);
    this.host.interactables.push(...(r.interactables ?? []));
    this.host.triggers.push(...(r.triggers ?? []));
  }

  private unload(id: string) {
    const r = this.loaded.get(id);
    if (!r) return;
    this.loaded.delete(id);
    const drop = <T>(list: T[], gone: readonly T[] | undefined) => {
      for (const it of gone ?? []) list.splice(list.indexOf(it), 1);
    };
    drop(this.host.interactables, r.interactables);
    drop(this.host.triggers, r.triggers);
    r.dispose();
  }
}
