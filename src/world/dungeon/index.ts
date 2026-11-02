import { SHRINE } from './defs/shrine';
import type { DungeonDef } from './format';
import { dungeonMap } from './map';
import { logicProblems, solveDungeon } from './solve';
import { validateDungeon } from './validate';
import { puzzleProblems } from './puzzle';

export * from './format';
export { dungeonMap } from './map';
export { explore, logicProblems, solveDungeon, type Progress, type SolveResult } from './solve';
export { validateDungeon } from './validate';
export { puzzleProblems, solveRoomPuzzle } from './puzzle';

/**
 * Every dungeon in the game. Each one is validated and solved by the tests, so a dungeon
 * that's malformed or can softlock fails `npm run check` before anyone plays it.
 */
export const DUNGEONS: DungeonDef[] = [SHRINE];

/**
 * Everything wrong with a dungeon: structure first (logic on a malformed dungeon would be
 * noise), then logic. Empty means it's sound.
 */
export function checkDungeon(def: DungeonDef): string[] {
  const errors = validateDungeon(def);
  return errors.length ? errors : [...logicProblems(def, solveDungeon(def)), ...puzzleProblems(def)];
}

/** A failure message with the map attached, so the problem can be seen, not just read. */
export function dungeonReport(def: DungeonDef) {
  const problems = checkDungeon(def);
  return [problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'No problems.', '', dungeonMap(def)].join('\n');
}
