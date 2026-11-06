import type * as THREE from 'three';
import type { Physics } from '../../core/physics';
import type { Interactable, Trigger } from '../area';
import type { TerrainRect } from './terrain';

/** What a loaded region hands back: its meshes, what can be interacted with, and how to take it all away. */
export interface BuiltRegion {
  readonly root: THREE.Group;
  readonly interactables?: Interactable[];
  readonly triggers?: Trigger[];
  update?(dt: number): void;
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
  build(physics: Physics): BuiltRegion;
}

/** By default a region loads when Wren is within this many meters of its rectangle and drops past `UNLOAD_DIST`. */
export const LOAD_DIST = 70;
export const UNLOAD_DIST = 110;

/** Meters from (x, z) to the rectangle (0 inside it). */
export function distToRect(r: TerrainRect, x: number, z: number) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}

/**
 * Builds and drops regions as Wren moves. A region is built in one go (it appears behind a mountain
 * well before she can see it), and its interactables and triggers join the host area's lists while it
 * is loaded. The hysteresis between the two distances stops a region flickering at the edge.
 */
export class RegionStreamer {
  private readonly loaded = new Map<string, BuiltRegion>();

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

  /** Loads what is near (x, z) and unloads what is far; colliders are ready when this returns. */
  streamAt(x: number, z: number) {
    let changed = false;
    for (const def of this.defs) {
      const d = distToRect(def.rect, x, z);
      const region = this.loaded.get(def.id);
      if (!region && d < (def.loadDist ?? LOAD_DIST)) {
        this.load(def);
        changed = true;
      } else if (region && d > (def.unloadDist ?? UNLOAD_DIST)) {
        this.unload(def.id);
      }
    }
    if (changed) this.physics.refreshQueries();
  }

  update(dt: number) {
    for (const r of this.loaded.values()) r.update?.(dt);
  }

  dispose() {
    for (const id of [...this.loaded.keys()]) this.unload(id);
  }

  private load(def: RegionDef) {
    const r = def.build(this.physics);
    this.loaded.set(def.id, r);
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
