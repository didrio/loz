import type { MusicMood } from '../core/tracks';
import type { Attack } from './enemies';

/**
 * The blight (docs/world.md, "Story"): the violet-black sickness over Emberfield, from the start
 * until the Keepers' seal breaks (`valleyOpen`). It lies on the open valley only: dungeons and
 * interiors have their own light. These are the rules; the sky, motes, growths and music just follow them.
 */

/** Thornlings that still roam the restored valley, day and night. Gloomwisps are gone for good. */
export const STRAY_THORNLINGS = 3;
/** How fast the blight lifts or settles, in level per second (about 4 s end to end). */
export const BLIGHT_RATE = 0.25;

interface AreaLike {
  id: string;
  indoor?: boolean;
  enemyCount: number;
}

/** Is the blight meant to lie on this area right now? */
export function blighted(area: Pick<AreaLike, 'id' | 'indoor'>, valleyOpen: boolean) {
  return area.id === 'overworld' && !area.indoor && !valleyOpen;
}

/** Moves the level toward its target at `BLIGHT_RATE`, without overshooting. */
export function stepBlight(level: number, target: number, dt: number) {
  const d = BLIGHT_RATE * dt;
  return level < target ? Math.min(target, level + d) : Math.max(target, level - d);
}

/** What lives in the field: the restored valley keeps a few stray thornlings and no wisps. */
export function fieldPopulation(area: AreaLike, valleyOpen: boolean) {
  const restored = area.id === 'overworld' && valleyOpen;
  return { thornlings: restored ? STRAY_THORNLINGS : area.enemyCount, wisps: !restored };
}

const BLIGHT_MOODS: Partial<Record<MusicMood, MusicMood>> = { day: 'blight', night: 'blightNight', village: 'blightVillage', villageNight: 'blightVillage' };

/** The field's song while the blight lies on it (other moods, like a dungeon's, are left alone). */
export function blightMood(mood: MusicMood, isBlighted: boolean): MusicMood {
  return (isBlighted && BLIGHT_MOODS[mood]) || mood;
}

/**
 * The blight's thorns (world/overworld/blight.ts) on Wren: a full heart, no shield can stop it, and a hard
 * shove back out of the clump (the overworld's `thornAt` finds it). The sword never cuts them; they only go when the blight lifts.
 */
export const THORN_ATTACK: Attack = { damage: 2, guard: 0, unblockable: true, knockback: 10 };
