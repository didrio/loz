# World bible

Places, characters, story and the quest thread. Read this before writing dialog, quests,
bosses or new places. Naming style: plain English compounds (Thistledown, Gloomwisp,
Glimmer Lake); avoid names that echo existing franchises.

## Writing for the player (the text rules)

Every word the player sees (dialog, signs, item messages, toasts, tutorial lines) follows
these. They are the owner's direction (2026-11-02); keep them in mind for all new text, and
recheck old text against them when you touch it.

- **Be deliberate: too much and too little are both failures.** One or two boxes per beat is
  the norm; three or more needs a reason. Don't trim for its own sake: cut what the player
  already knows, can see, or doesn't need *yet*. Tutorial text (controls, mechanics) says
  what to press and what happens, and nothing else; the flavor lives elsewhere.
- **Clear first, then characterful.** The player should always know what they got, what it
  does and where to go next. Then it should sound like *someone*, not like a template.
  Each NPC has a voice (Maren: warm and worried; Tobin: dry; Odo: wry salesman); keep it.
- **Not generic.** Prefer a specific detail (the lamps, the flour, the mill, the hollow's
  forty years of lamplighting) over a stock line. If a line could be said in any fantasy
  game, rewrite it for Emberfield. Mood: wistful, a little odd, never jokey for long.
- **Make NPCs react to the world, where it helps and adds immersion**: day vs night, before
  and after the lantern is lit or a dungeon is cleared, Wren's gear (the sword, the
  Stoneward Tunic), the weather of the story. Not every NPC needs every variant: pick the ones
  the player will notice and enjoy. Variants go in the script's `if` chain by state/flag, with
  the freshest story state first.
- **Signs and flavor text carry the world's history**, one idea each, short enough to read at
  a glance. Items say what they are in the first line.
- **No spelling out what the screen shows.** Don't narrate the HUD or the obvious.
- Text lives in content scripts today; when dialog moves to data (roadmap), these rules still
  apply.

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

- **The Hushing Gorge** (working name; built): a winding cut in the western mountain ring, west of the
  valley, where the keepers hid the Morrowbell. A sign at its mouth warns walkers off; a statue of a
  keeper still stands guard in the corridor, thornlings nest below, and the way on is over a pit on
  rock pillars.

## The keepers' bells

While the great lantern burned, the shrine's keepers rang its hours from bells on crooked posts
around the valley, all cast from one bronze warmed at the lantern's flame, so each answers the
others (and a keeper could follow the answer from post to post: fast travel). Each bell is named
for the hour it rang: the **Morrowbell** rang the dawn and Thistledown woke to it (its post is on
the square); the **Lullbell** rang dusk to tell the shrine's stones to sleep (its post is in the
Hall of Sleepers). When the flame was stolen the keepers hid the bells where a thief would
struggle to reach them, at the end of climbs. Later bells take other hours. Details and rules:
[bells.md](bells.md).

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
- **Maren**: older villager in purple by the well (warm and worried; her advice changes at night); her father locked his blade in the
  grove chest and she gives Wren the key.
- **Tobin the Miller**: dry humor, runs the windmill; saw the flame carried off south. Once
  Wren is armed he gives the **Mill Key** (`village.millKey`); the windmill's door (west side of
  the square) opens onto his mill, where the bed sleeps to the next 06:00/18:00 and fully
  heals.
- **Lark**: a small kid by the well (breathless, conspiratorial). Secretly rides Tobin's flour tray down
  the bank behind the mill and talks Wren into riding her shield (`village.surfIdea`, then the how-to line;
  see shield surfing in [combat.md](combat.md)). After her first ride (`village.surfTried`) Lark brags about
  seeing it, by day or night.
- **Odo the Peddler**: warm, wry (he remarks on a sword without armor, and on the tunic by day or night); a stall beside the well. Refills empty flasks and sells the **Stoneward Tunic**
  (50 gems; stone hits do half damage, rounded up; Wren's tunic turns slate-blue). Flask
  refills (roadmap E) will be sold here through the same `offerWare`.
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

## Murmurbuds and the keepers' notes

The keepers sealed advice for whoever came after them in **Murmurbuds**: stubby stone-grey
bulbs in a collar of leaves, tucked into the valley's nooks (owner's idea, 2026-11-03). Steady
strikes wake one and it swells; strike too fast and it clams up, shivers, and shrinks back
("nuh-uh"). At full size it peels open and a rolled note tied with red thread floats over the
petals until Wren reads it ("Read"); then the note is gone, kept in the pause menu. The note is
the whole reward (no gems: owner's call). A closed bud trails a thin wisp of colored motes from
its tip (so it reads as something), and lock-on can hold it. Only reading is saved: a bud opened
but not read closes again on reload.

- **Voice**: the keepers, writing for a stranger: old-fashioned, fond, a little bossy, one
  practical idea per note, specific to Emberfield. Titles are "On ...".
- **Notes** (`content/hints.ts`, bud ids `bud.<hint>` placed in `world/overworld/layout.ts`
  `BUDS`): *On stone and cloth* (buy the Stoneward Tunic; behind the windmill), *On empty
  flasks* (Odo refills them, red or amber; Glimmer Lake's east bank), *On bells and posts* (a
  post's arm names its bell; rung bells answer, and you can follow; by the Hushing Gorge's mouth).
- **Adding one**: an entry in `HINTS`, its flag `hint.<id>` in `FLAGS` (`game/state.ts`), a spot
  in `BUDS`. `content/hints.test.ts` checks the three line up.
- **The rule** (`game/murmurbud.ts`, run by `game/buds.ts`): a strike adds 0.25 to a gauge that
  drains 0.3/s; the bud grows while the gauge is at 0.45 or more and opens after ~3.3 s there; a
  strike that would overfill it overloads it (growth to 0, 1.2 s sulk). Mashing overloads in
  ~2 s; a strike every ~0.8 s opens one in ~5 s. A gauge floats over the nearest stirred bud.

## Enemies and pickups

- **Thornling**: hopping thorn ball; wanders, winds up, lunges.
- **Gloomwisp**: night only, floats through walls, one hit; a boss can summon tame ones
  that orbit it.
- **Planned for the first dungeon** (design draft, see [shrine.md](shrine.md)): Dozing
  Sentinel and Shellback enemies, the Tether Glove, the boss Gravelheart, the Sleepless
  Warden, and the Northpass (Emberfield's exit, sealed by a magic gate that breaks once the Warden sleeps; see [shrine.md](shrine.md)).
- **Pickups**: green gem (1), blue gem (5), heart. **Heart Vessel**: +1 heart container.
  **Small Key**: opens one padlock or locked door (`GameState.keys`, shown under the gems).
- **Flasks**: exactly two, found full in the Waking Shrine (life in the Sunken Court,
  attack in the Echo Hall). A flask holds one potion: **Life Potion** (red: every heart back)
  or **Attack Potion** (amber: the sword hits twice as hard for 30 seconds). Drunk, it stays
  empty, even through death, until Odo fills it (20 gems, either potion, one flask at a time).
- **Wakestones**: light ones are pale with green spirals (the sword moves them); heavy ones
  are dark violet banded in bronze with glowing teal spirals (only the Tether Glove moves
  them).
