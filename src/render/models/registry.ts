import { buildCragstalker } from './cragstalker';
import { buildGloomwisp } from './gloomwisp';
import { buildBellItem, buildDoll, buildFlask, buildKeyItem, buildShieldItem, buildSwordItem, buildTetherGlove, buildTunicItem } from './gear';
import { buildGravelheart } from './gravelheart';
import { buildLamplighter } from './lamplighter';
import { buildGrassTuft, buildLoneOak, buildPine, buildRock, buildRoundTree } from './nature';
import { buildBush, buildChest, buildGreatLantern, buildHeartVessel, buildHingedDoor, buildShieldPickup, buildStoneDoor } from './props';
import { pal } from '../palette';
import { buildSentinel } from './sentinel';
import { buildShellback } from './shellback';
import { buildThornling } from './thornling';
import type { Model } from './types';
import { buildMill, buildMillSails, buildStall } from './mill';
import { buildRuin } from './ruins';
import { buildBarrel, buildCottage, buildCrate, buildFenceSection, buildLanternPost, buildWell } from './village';
import { buildPerson, buildWren, VILLAGER_COLORS } from './wren';

/**
 * Every model in the game (docs/pipeline.md, "The registry and validator"). One entry per model: an id, what kind of thing
 * it is (which sets its budget, in `validate.ts`), its tier, and a pure `build()` (no physics, no game).
 */
export type AssetKind = 'player' | 'enemy' | 'miniboss' | 'boss' | 'npc' | 'prop' | 'piece';

/**
 * `rough`: playable, the validator only warns. `final`: finished, so every validator finding fails `npm run check`.
 * A final pass replaces the rough model in place; there is never a rough and a final one side by side.
 */
export type AssetTier = 'rough' | 'final';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  tier: AssetTier;
  build: () => Model;
  /** Where it is used, for the table. */
  note?: string;
}

/** The golden set (art.md "The golden set"): owner-approved ids that define the style. The contact sheet marks them. */
export const GOLDEN_SET: readonly string[] = ['chest', 'thornling', 'wren'];

export const ASSETS: readonly AssetEntry[] = [
  { id: 'wren', kind: 'player', tier: 'final', build: () => buildWren(1), note: 'tunic, sword and shield; posed by their rig' },
  { id: 'villager', kind: 'npc', tier: 'rough', build: () => buildPerson(VILLAGER_COLORS), note: 'the humanoid every NPC shares (Maren\'s colours)' },
  { id: 'thornling', kind: 'enemy', tier: 'final', build: buildThornling },
  { id: 'gloomwisp', kind: 'enemy', tier: 'rough', build: buildGloomwisp },
  { id: 'dozing-sentinel', kind: 'enemy', tier: 'rough', build: buildSentinel },
  { id: 'shellback', kind: 'enemy', tier: 'rough', build: buildShellback },
  { id: 'cragstalker', kind: 'enemy', tier: 'rough', build: buildCragstalker },
  { id: 'hollow-lamplighter', kind: 'miniboss', tier: 'rough', build: buildLamplighter },
  { id: 'gravelheart', kind: 'boss', tier: 'rough', build: buildGravelheart },
  { id: 'chest', kind: 'prop', tier: 'final', build: () => buildChest(true), note: 'locked, with its padlock' },
  { id: 'hinged-door', kind: 'prop', tier: 'rough', build: () => buildHingedDoor() },
  { id: 'stone-door', kind: 'prop', tier: 'rough', build: () => buildStoneDoor(), note: 'the shrine\'s door size' },
  { id: 'heart-vessel', kind: 'prop', tier: 'rough', build: buildHeartVessel },
  { id: 'shield-pickup', kind: 'prop', tier: 'rough', build: buildShieldPickup },
  { id: 'great-lantern', kind: 'prop', tier: 'rough', build: buildGreatLantern },
  { id: 'bush', kind: 'prop', tier: 'rough', build: buildBush },
  // The valley's nature (T51a): instanced across the whole valley, tinted per instance (render/models/nature.ts).
  { id: 'tree', kind: 'prop', tier: 'final', build: buildRoundTree, note: 'the field tree, instanced' },
  { id: 'pine', kind: 'prop', tier: 'final', build: buildPine, note: 'instanced' },
  { id: 'rock', kind: 'prop', tier: 'final', build: buildRock, note: 'instanced' },
  { id: 'grass-tuft', kind: 'prop', tier: 'final', build: buildGrassTuft, note: 'instanced, ~3,000' },
  { id: 'lone-oak', kind: 'piece', tier: 'final', build: buildLoneOak, note: 'the landmark at the grove road, merged scenery' },
  // Thistledown's frame (T51b): the cottages, the well and the village props, merged scenery (render/models/village.ts).
  { id: 'cottage-east', kind: 'piece', tier: 'final', build: () => buildCottage('east'), note: 'green shutters, flower boxes, a bench' },
  { id: 'cottage-southwest', kind: 'piece', tier: 'final', build: () => buildCottage('southwest'), note: 'timber framing, a porch, a woodpile, herbs' },
  { id: 'well', kind: 'prop', tier: 'final', build: buildWell, note: 'the shaft\'s inside and water are the world\'s' },
  { id: 'fence-section', kind: 'prop', tier: 'final', build: buildFenceSection, note: 'a post and two rails' },
  { id: 'lantern-post', kind: 'prop', tier: 'final', build: buildLanternPost, note: 'the glowing core is the world\'s' },
  { id: 'barrel', kind: 'prop', tier: 'final', build: buildBarrel },
  { id: 'crate', kind: 'prop', tier: 'final', build: buildCrate },
  // The rest of the vignette (T51c): the windmill and its sails, Odo's stall, a ruined home (merged scenery).
  { id: 'mill', kind: 'piece', tier: 'final', build: () => buildMill(), note: 'the tower\'s outside, door frame, lamp bracket, axle; the inside and the glowing lamp are the world\'s' },
  { id: 'mill-sails', kind: 'piece', tier: 'final', build: buildMillSails, note: 'four lattice sails, turned about the hub by the world' },
  { id: 'odo-stall', kind: 'piece', tier: 'final', build: buildStall, note: 'counter, striped awning, shelf, wares' },
  { id: 'ruined-home', kind: 'piece', tier: 'final', build: () => buildRuin(1.3, 1), note: 'broken walls, a fallen shingle roof, charred rafters; jars are the world\'s' },
  // The gear (the Gear tab and the HUD's icons: render/icons.ts).
  { id: 'gear-sword', kind: 'prop', tier: 'rough', build: buildSwordItem, note: 'icon' },
  { id: 'gear-shield', kind: 'prop', tier: 'rough', build: buildShieldItem, note: 'icon' },
  { id: 'gear-tunic', kind: 'prop', tier: 'rough', build: buildTunicItem, note: 'icon' },
  { id: 'gear-glove', kind: 'prop', tier: 'rough', build: buildTetherGlove, note: 'icon' },
  { id: 'gear-flask', kind: 'prop', tier: 'rough', build: () => buildFlask(null), note: 'icon, empty' },
  { id: 'gear-flask-life', kind: 'prop', tier: 'rough', build: () => buildFlask(pal('crimson')), note: 'icon' },
  { id: 'gear-flask-attack', kind: 'prop', tier: 'rough', build: () => buildFlask(pal('amber')), note: 'icon' },
  { id: 'gear-bell', kind: 'prop', tier: 'rough', build: buildBellItem, note: 'icon' },
  { id: 'gear-key', kind: 'prop', tier: 'rough', build: () => buildKeyItem(), note: 'icon' },
  // One per dungeon key colour (the same five hues as world/dungeon/format.ts KEY_HEX).
  ...(['crimson', 'azure', 'jade', 'violet', 'amber'] as const).map((c): AssetEntry => ({ id: `gear-key-${c}`, kind: 'prop', tier: 'rough', build: () => buildKeyItem(pal(c)), note: 'icon' })),
  { id: 'gear-doll', kind: 'prop', tier: 'rough', build: buildDoll, note: 'icon' },
];

export function assetById(id: string): AssetEntry | undefined {
  return ASSETS.find((a) => a.id === id);
}
