import type { Physics } from '../core/physics';
import type { Area } from '../world/area';
import { DungeonArea } from '../world/dungeon/build';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { Overworld } from '../world/overworld';
import { overworldContent, type AreaContent } from './overworld';
import { shrineContent } from './shrine';

// (Tobin's mill was an area of its own until 2026-11-04; its room is now the windmill's ground floor,
// so a save made inside it continues in the overworld.)
export const AREA_IDS = ['overworld', 'shrine'] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** For saves: an area id the game can actually load. */
export const isAreaId = (v: string): v is AreaId => (AREA_IDS as readonly string[]).includes(v);

/** Builds an area and binds its content. Adding a dungeon = adding a case here. */
export function createArea(id: AreaId, physics: Physics): { area: Area; content: AreaContent } {
  switch (id) {
    case 'overworld': {
      const ow = new Overworld(physics);
      return { area: ow, content: overworldContent(ow) };
    }
    case 'shrine': {
      const area = new DungeonArea(physics, SHRINE);
      return { area, content: shrineContent(area) };
    }
  }
}
