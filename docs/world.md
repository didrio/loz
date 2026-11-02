# World bible

Places, characters, story and the quest thread. Read this before writing dialog, quests,
bosses or new places. Naming style: plain English compounds (Thistledown, Gloomwisp,
Glimmer Lake); avoid names that echo existing franchises.

## Places

- **Emberfield**, the valley at the heart of the land of **Embervale**: a gentle field
  ringed by mountains. **Thistledown Village** (northwest: cottages, a well, a windmill that
  turns without wind), **the Whispering Grove** (northeast: dense trees, a clearing with
  Maren's father's padlocked chest), **the Waking Shrine** (east hill: a stone shrine with a
  dead lantern on its roof, ringed by old pillars), **Glimmer Lake** (southwest), a river
  across the south with a wooden bridge.
- **Gloaming Hollow**: a sunken, dead clearing at the end of the south road, ringed by bare
  black trees and old iron lamp posts, with ash drifting up. Sign: "Here ends the
  lamplighter's road." The arena of the first mini-boss.

## Story

- The lantern atop the shrine went dark; thornlings appeared in the field. The pedestal
  reads: "While the lantern burns, the sleeping stone shall wake. Rekindle the lantern, and
  the night shall break." The flame didn't go out: it was *taken*.
- **The main quest frame: each major boss holds an ember of the stolen flame; returning
  embers relights the great lantern** (it glows brighter with each;
  `GreatLantern.setEmbers`).

## The quest thread so far

Each step points at the next, loosely guided:

intro ("go see Maren") → the grove chest is padlocked ("someone in Thistledown might have
the key") → Maren gives the **Small Key** (flag `gotGroveKey`, keys +1) → the key opens the
chest: the sword, and "head back to Thistledown" → armed, Maren and Tobin say the shrine
door won't budge and the flame was carried south to the **Gloaming Hollow**; the door
itself says the same → (unarmed, Wren backs out of the hollow; the fight only starts with
a sword) → the Lamplighter falls, its ember relights the lantern and **wakes the shrine
door** (its spiral goes from dark to glowing, `StoneDoor.wake`) → interact with the door
("Open") to sink it → walk in: **the Waking Shrine** (the first dungeon; the entrance seals
behind Wren until its keeper falls; see [shrine.md](shrine.md)). The boss is the only way
in.

## Characters

- **Wren** (hero): rust-orange coat, teal scarf, dark hair, round wooden shield; finds the
  **Wayfarer's Blade** in the grove.
- **Maren**: older villager in purple by the well; her father locked his blade in the
  grove chest and she gives Wren the key.
- **Tobin the Miller**: dry humor, runs the windmill; saw the flame carried off south.
- **The Hollow Lamplighter**, Keeper of a Stolen Flame (mini-boss, Gloaming Hollow): a
  4.4 m gaunt figure in a tattered lamplighter's coat, bone legs and arms, a hooked pole
  with a snuffer bell, candles on one shoulder, caged wisps on its belt, and an iron
  lantern cage for a head holding a cracked porcelain mask and the stolen flame, gone cold
  and blue. Villagers say old Corwin, who lit the hollow's lamps for forty years, still
  walks his rounds, "only taller than he was". **It only walks at night**: it's in the
  hollow from dusk to dawn and gone by day (unless a fight is under way), so the fight is
  always at night (the owner's call: an early nudge to think about the time of day; villagers
  hint "after dark"). Beaten, its flame turns warm and flies
  home: the shrine lantern's first ember. Leaves a **Heart Vessel** (+1 heart).

## Enemies and pickups

- **Thornling**: hopping thorn ball; wanders, winds up, lunges.
- **Gloomwisp**: night only, floats through walls, one hit; a boss can summon tame ones
  that orbit it.
- **Planned for the first dungeon** (design draft, see [shrine.md](shrine.md)): Dozing
  Sentinel and Shellback enemies, the Tether Glove, the boss Gravelheart, the Sleepless
  Warden, and the Northpass (Emberfield's exit, blocked by a heavy wakestone).
- **Pickups**: green gem (1), blue gem (5), heart. **Heart Vessel**: +1 heart container.
  **Small Key**: opens one padlock or locked door (`GameState.keys`, shown under the gems).
- **Drinks** (found in dungeon chests; single-use, refilled when Wren falls): the
  **Restoring Draught** (red bottle: every heart back) and the **Ember Tonic** (amber bottle:
  the sword hits twice as hard for 30 seconds). More kinds can come later.
- **Wakestones**: light ones are pale with green spirals (the sword moves them); heavy ones
  are dark violet banded in bronze with glowing teal spirals (only the Tether Glove moves
  them).
