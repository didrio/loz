import type { GameState } from './state';

/** A dungeon whose boss is beaten plays no music (the valley outside keeps its songs). */
export function dungeonQuiet(areaId: string | undefined, state: GameState) {
  return areaId !== undefined && !!state.dungeons.get(areaId)?.done;
}
