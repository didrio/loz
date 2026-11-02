import type { Physics } from '../core/physics';
import type { Area } from '../world/area';
import { Overworld } from '../world/overworld';
import { overworldContent, type AreaContent } from './overworld';

export type AreaId = 'overworld';

/** Builds an area and binds its content. Adding a dungeon = adding a case here. */
export function createArea(id: AreaId, physics: Physics): { area: Area; content: AreaContent } {
  switch (id) {
    case 'overworld': {
      const ow = new Overworld(physics);
      return { area: ow, content: overworldContent(ow) };
    }
  }
}
