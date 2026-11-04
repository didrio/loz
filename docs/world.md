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
- **Directions are true from where they're said** (owner's call, 2026-11-04). A villager in Thistledown says
  where a place lies *from Thistledown* ("east of here, across the field"), or names a landmark to start from
  ("from the crossroads, northeast, past the lone oak"). The HUD compass (`ui/compass.ts`) lets the player
  follow it from that spot. Check every direction against `world/overworld/layout.ts` (+x east, −z north), and
  every landmark a line names must exist in the world (the lone oak was only in the dialog until 2026-11-04).
- **No spelling out what the screen shows.** Don't narrate the HUD or the obvious.
- **No kin** (owner's rule, 2026-11-03): villagers are neighbors, never family. No one says mum, father, grandmother,
  sister and so on; they can remember people who are gone by name (old Bram, old Hesper, Corwin). A unit test in
  `content/overworld.test.ts` scans every content string for kin words.
- **Every word earns its place** (owner's rule, 2026-11-04; reference: Dark Souls dialog and item text). Draft the line,
  then cut it by half without losing what it tells or asks of the player. A box is **at most ~120 visible characters**
  (a button counts as one) and **at most 2 highlights**. A content test (`content/textRules.test.ts`) enforces both and
  that tags are valid; old over-long boxes are a ratchet in that file (`LONG_ALLOWED`) that the text pass (roadmap C3/C6)
  brings to zero, so lower it when you cut.
  - Before: `You found a *Wooden Shield*!\nScorched at the rim, but the planks are sound.`
  - After: `[gear]Wooden Shield[/]. Scorched, but sound.`
- **Highlights carry meaning, never decoration.** Tags close with `[/]` (`ui/richText.ts`, styled in `ui/style.css`):

  | Tag | Look | For |
  |---|---|---|
  | `[gear]` | gold | items, keys, gear, potions |
  | `[place]` | pale blue | named places |
  | `[danger]` | ember red | threats and warnings |
  | `[old]` | violet | the blight, the Keepers, sigils, names from the past |
  | `[key]` | bold | button and control words |
  | `[soft]` | italic, dim | whispers, things said low or written small |
  | `[shake]` | trembles | very rare: fear, a failing thing |
  | `[fade]` | slow fade-in | very rare: a line that arrives late |

  `[shield]`, `[interact]` and the other action names draw a button glyph, so **a tag may never be named like an action**
  (a unit test checks; that is why gold is `[gear]`, not `[item]`). An unknown or unclosed tag fails the content test.
  The old `*x*` emphasis is gone.
- Text lives in content scripts today; when dialog moves to data (roadmap), these rules still
  apply.

## Places

- **Emberfield**, the valley at the heart of the land of **Embervale**: a gentle field
  ringed by mountains. **Thistledown Village** (northwest: cottages, a well, a windmill that
  turns without wind), **the Whispering Grove** (northeast: dense trees, a clearing with
  old Bram's padlocked chest), **the Waking Shrine** (east hill: a stone shrine with a
  dead lantern on its roof, ringed by old pillars), **Glimmer Lake** (southwest), a river
  across the south with a wooden bridge.
- **Gloaming Hollow**: a sunken, dead clearing at the end of the south road, ringed by bare
  black trees and old iron lamp posts, with ash drifting up. Sign: "Here ends the
  lamplighter's road." The arena of the first mini-boss.

- **Ruins**: Thistledown's ring has two standing cottages (east, southwest) and two ruined ones (northeast, northwest); more
  ruined homes lie across the valley (the shield's cottage north of the village, one by the south road, one by Glimmer Lake, one by
  the Northpass gate). Each holds clay **jars** a sword breaks once (saved): one with a blue gem (5), one or two with a heart, the rest empty.
  The lake home was Pip's: its sixth jar (`lakeHome.5`) holds her doll, Button (`jar.doll` script, flag `village.dollFound`).

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

**Being revamped** (owner's direction, 2026-11-03; the build is roadmap item 0.7, sessions S1–S5).
Gameplay stays as it is. The story becomes stranger and more personal. The owner is holding back
later reveals, so **don't explain why he was exiled or how he became stone**, and don't invent more
of his backstory without asking. Lines marked *(fill-in)* are Claude's proposals and the owner may
change them.

- **The exile.** Years ago Thistledown sent one of its own away over the Northpass. Why is unsaid.
  Nobody speaks his name (Lark: "if you say it, he hears"), and **the game never names him**.
  The world past the mountains had become worse than anyone in the valley knew.
- **His return** *(fill-in: "some weeks ago")*. The night he came back, the lantern on the shrine
  went dark (he took its flame, and old Corwin the lamplighter carried it south and became the
  Hollow Lamplighter), a gate of floating stone sealed the Northpass, and **the blight** settled
  over Emberfield: violet-black air and sky, thornlings, wisps, homes in ruins. Odo, a traveling
  peddler, was passing through and is shut in with the village.
- **The village** is afraid and paranoid. Nobody leaves the fence. Wren is one of them: everyone
  but Odo knows Wren well, and the exact relationships stay vague (even Lark's).
- **He waits in the shrine** and writes to Wren in floating magic symbols (code name **sigils**):
  one in the hollow once the Lamplighter falls ("come and see me"), and three in the shrine's
  fight rooms that tell his grievance in his own words. Once Wren has read one, the villagers
  react, reluctantly. Tobin admits he was one of theirs.
- **Gravelheart is him.** The player expects a man or a wizard and finds a stone giant. What
  happened to him in there is the owner's later reveal. Epithet *(fill-in, in the game)*: "Who Came Home"
  (it was "the Sleepless Warden"; the keepers' warden lore is dropped).
- **The prism.** His ward is held by a prism floating in beams of light in the room past his
  hearth. Wren shatters it with the sword: the gate falls and **the blight lifts** (owner's call:
  at the prism, not at the boss). The valley returns to today's look and music, with no gloomwisps
  and only a few stray thornlings.
- **The bell behind the mill** (owner's call, 2026-11-04): beating Gravelheart takes the Morrowbell off the square's post, so the
  player walks home instead of fast traveling ([bells.md](bells.md)). No NPC mentions it; the player has to look around.
- **The empty village** (owner's call, 2026-11-03). The moment the prism breaks, **Maren, Tobin and Odo vanish**
  with the blight; nobody saw them go and nothing is left behind. Only the kids, Lark and Pip, remain: glad the sky is
  back, scared and confused about the grown-ups. Lark tells Wren and points at Pip; **Pip, the shy one, asks Wren to
  find them** (`village.searchAsked`). Odo's stall stays open on trust (Wren leaves the gems in his cashbox) and the
  mill is unlocked. *Later (not built):* the major story quests out in the world find the three and bring them home
  (Odo back at his stall); the kids' lines keep changing with the world. Code: `adultsGone`/`VANISHED` in
  `content/villageNews.ts`, `Npc.setPresent`, `honorStall` in `content/village.ts`.
- **Kept from before**: the pedestal ("While the lantern burns, the sleeping stone shall wake.
  Rekindle the lantern, and the night shall break."), the keepers, their bells and Murmurbuds,
  and the quest frame: **each major boss holds an ember of the stolen flame, and returning embers
  relights the great lantern** (`GreatLantern.setEmbers`).
- **Storytelling style** (owner): clear to a player who's paying attention, never hand-holding.
  Told through what people won't say, what's written in the air and what the valley looks like.

### The sigils (text drafts)

| Where | Appears | Text |
|---|---|---|
| Gloaming Hollow | the Lamplighter falls | *If you've laid old Corwin down, come and see me. I'm in the shrine.* |
| Sentinel Cell (floor 0) | room cleared | *They sent me over the pass with nothing. Nobody cared if I came back.* |
| Crypt (floor −1) | room cleared | *None of them knew what the world past the mountains had become, or what it did to me. They could have wondered.* |
| The Gauntlet (floor −2) | room cleared | *THIS IS MY HOME.* |
| Keepers' Seal room (beside the prism) | the ward is broken (the stone, later the prism) | *(owner's text)* Something is happening to me here in the shrine; I am becoming more powerful. If you are reading this, I suppose you have felled me. In that case... well... I'm sorry for what happened. (Hints that he changed shape inside the shrine; the story's resolution.) |

**Built (S4, 2026-11-03).** `world/sigil.ts` (`SigilLook`: a slow ring of pale glyphs round a bright core, 1.7 m up; "Read"),
`content/sigils.ts` (registry `SIGILS`, flags `sigil.<name>`, `readSigil`, `foundSigils`). The hollow's appears in the Lamplighter's
death scene (`Overworld.sigil`); the shrine's four are dungeon things of kind `sigil` (`appears: { cleared }` for `sigil.cell|crypt|gauntlet`, which stay once
their room is cleared; `sigil.seal` in the seal room appears once the seal-stone is broken, later the prism: `appears: { switch: 'sealStone' }`). A room with a sigil
is a **challenge room** like one with a chest: once cleared it stays empty after death and reload. Rule: a message only appears after Wren has done something. The hollow's stands 4 m beside the Heart Vessel. The pause menu's **Messages** page lists the ones read. Villagers:
`content/villageNews.ts` (`withNews`): each reacts once to the first sigil read (flag `village.<n>Sigil`) and, once the ward
breaks, only the kids speak: Lark once (`village.larkRelief`), Pip's ask (`village.searchAsked`); the adults are gone (above), and that visit's usual talk waits until the next. Text pass: the gate sign, the ward toast, Gravelheart's
epithet and defeat line. Texts of the sigils are the drafts above.

### The blight (S2, built 2026-11-03)

The valley is sick from the first frame until the Keepers' seal breaks (`valleyOpen`); the rules live in
`game/blight.ts` (tested), everything else follows them. Dungeons and interiors are never blighted.
- **Sky** (`Sky.blight`, 0–1): a violet-black sky and fog, weaker sun, dim stars; the same weight by day and night
  (the night sinks as far as the night sky does). Boss gloom stacks on top.
- **Ash motes** (`render/motes.ts`) drift around the player.
- **Thorns** (`world/overworld/blight.ts`, own RNG `blight`; 2026-11-04, owner's design): clumps of 3–8 m violet
  spikes (`THORN_SPREAD` 3 m), ~30 lone ones in the open field plus **thickets** (`THICKETS` in `layout.ts`): rings
  round the flasks bud, the roadside ruin and Pip's lake home, each with one opening (`gap`, a compass bearing) so the
  way in is a short walk round. Touching one costs a heart (`THORN_ATTACK` in `game/blight.ts`, unblockable) and shoves
  Wren back out (no colliders, so the camera never snags). The sword never cuts them. They shrink away as the blight
  lifts and are harmless below half grown. Roads, the village's safe zone, the start, signs, buds, the lone oak, the
  gate and the passes stay clear (`layout.test.ts` checks every thicket: roads, its gap, what it guards).
- **Music**: placeholder `blight`, `blightNight`, `blightVillage` ([audio.md](audio.md)); the owner listens.
- **The lift**: when `valleyOpen` is set in the gate vision, the level eases to 0 over ~4 s (`BLIGHT_RATE`) and the
  music crossfades. A loaded area starts at its level (no easing). Not a new cutscene: it happens inside the existing vision.
- **Restored field** (owner's call): `STRAY_THORNLINGS` = 3 thornlings, day and night, and **no gloomwisps** any more.
  Blighted: 14 thornlings and night wisps as before. The Lamplighter still only walks at night.

### The opening (S1, built 2026-11-03)

**No cutscenes for story** (owner's call, 2026-11-03): like Dark Souls, the story comes from talking
to people. New cutscenes need the owner's say-so; quick lines are fine.

A new game starts without a word: Wren stands in the field with no sword and no shield, and the
crossroads sign points one way, "← Thistledown Village". Until the scare, the villagers' own lines
carry the opening: Maren scolds Wren for being out past the fence and gives nothing, Tobin is dry
("Bold. Daft, but bold."), Odo meets Wren for the first time, and Lark whispers about a shield in the
roofless cottage past the **north fence**. The shield lies in the ruined cottage north of the village
(`RUINS` in layout.ts; hidden behind the houses from the road in, in plain view through the north gap on
the way out; a glint on its boss); it can be taken any time. Taking it teaches the guard, then the
scare (`village.scare`): a scream and a dropped bucket (`sfx.scream()`), one line ("Ahh!!!", from the
village), and straight back to play. Afterwards the talk turns to it: Maren, shaken, gives the key
("I threw the bucket at it"); Tobin saw it "tall, or wide, or both"; Lark brags she was right.

## The quest thread so far

Each step points at the next, loosely guided:

a wordless start (the sign points home) → the villagers scold, Lark's tip → the shield and the scream →
the grove chest is padlocked ("someone in Thistledown might have
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

- **Wren** (hero): rust-orange coat, teal scarf, dark hair; finds the round wooden shield in a ruined cottage and the
  **Wayfarer's Blade** in the grove.
- **Maren** (gone after the prism): older villager in purple by the well (warm and worried; her advice changes at night); old Bram (who kept the fence
  before the blight, now gone) locked his blade in the grove chest, and she gives Wren the key.
- **Tobin the Miller** (gone after the prism; the mill stays unlocked): dry humor, runs the windmill; saw the flame carried off south. Once
  Wren is armed he gives the **Mill Key** (`village.millKey`); the windmill's door (west side of
  the square) swings open onto his room, the windmill's ground floor (walked into, no loading), where
  the bed sleeps to the next 06:00/18:00 and fully heals. The two standing cottages' doors are locked ("The
  door is locked.", no hint of a key): they open in a later chapter.
- **Lark**: a small kid by the well (breathless, conspiratorial). Points Wren at the shield in the ruined cottage. Secretly rides Tobin's flour tray down
  the bank behind the mill and talks Wren into riding her shield (`village.surfIdea`, then the how-to line;
  see shield surfing in [combat.md](combat.md)). After her first ride (`village.surfTried`) Lark brags about
  seeing it, by day or night.
- **Odo the Peddler** (gone after the prism; his stall runs on trust): warm, wry (he remarks on a sword without armor, and on the tunic by day or night); a stall beside the well. Refills empty flasks and sells the **Stoneward Tunic**
  (50 gems; stone hits do half damage, rounded up; Wren's tunic turns slate-blue). Flask
  refills (roadmap E) will be sold here through the same `offerWare`.
- **Pip**: a smaller kid east of the well (shy, solemn; talks about her patched doll **Button** as if she were a person).
  She left Button in a jar at her old house by Glimmer Lake (`lakeHome`, far southwest). She only asks once Wren has the sword (before it she couldn't break the jar), and every ask says where; before the sword she's just scared of the thorns and the night. Breaking
  that jar finds the doll (`village.dollFound`; nothing in the HUD); taking it back earns **20 gems** (`village.dollReturned`).
  Her lines change by night, the sword and the lifted blight; she has her own sigil and relief news. Optional side errand.
- **The Hollow Lamplighter**, Keeper of a Stolen Flame (mini-boss, Gloaming Hollow): a
  4.4 m gaunt figure in a tattered lamplighter's coat, bone legs and arms, a hooked pole
  with a snuffer bell, candles on one shoulder, caged wisps on its belt, and an iron
  lantern cage for a head holding a cracked porcelain mask and the stolen flame, gone cold
  and blue. Villagers say old Corwin, who lit the hollow's lamps for forty years, still
  walks his rounds, "only taller than he was". **It only walks at night**: it rises in the
  hollow at dusk in a swirl of embers and smoke and gutters out the same way at dawn, so the fight
  starts at night (the owner's call: an early nudge to think about the time of day; villagers
  hint "after dark"). **The dawn burn** (owner's idea, 2026-11-04): a fight that runs past dawn keeps it from
  going home, and the daylight burns it from full health to nothing in about a minute (`BURN_SECONDS` in
  `game/bosses/lamplighter.ts`, via `Boss.sear`), phase two and death as usual. A patient player can win by guarding. Beaten, its flame turns warm and flies
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
  practical idea per note, specific to Emberfield. Titles say plainly what the note helps with ("Refilling your flasks"); each text names the person, the price or the button involved.
- **Notes** (`content/hints.ts`, bud ids `bud.<hint>` placed in `world/overworld/layout.ts` `BUDS`, spread over the valley, 60+ m apart):
  *The Stoneward tunic* (Odo sells it, 50 gems; off the road to Thistledown), *Refilling your flasks* (Odo, 20 gems each; the river's
  south bank), *Bells, posts and travel* (a post's arm names its bell; rung bells answer, and you can travel; by the Hushing Gorge's
  mouth), *Fighting the stone giant* (jump the shock ring; after a slam pull the glowing chest plate off; it deliberately never names the Tether Glove, owner's call; beside the shrine road).
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
  Sentinel and Shellback enemies, the Tether Glove, the boss Gravelheart, Gravelheart (Who
  Came Home), and the Northpass (Emberfield's exit, sealed by a magic gate that breaks once the Warden sleeps; see [shrine.md](shrine.md)).
- **Pickups**: green gem (1), blue gem (5), heart. **Heart Vessel**: +1 heart container.
  **Small Key**: opens one padlock or locked door (`GameState.keys`, shown under the gems).
- **Flasks**: exactly two, found full in the Waking Shrine (life in the Sunken Court,
  attack in the Echo Hall). A flask holds one potion: **Life Potion** (red: every heart back)
  or **Attack Potion** (amber: the sword hits twice as hard for 30 seconds). Drunk, it stays
  empty, even through death, until Odo fills it (20 gems, either potion, one flask at a time).
- **Wakestones**: light ones are pale with green spirals (the sword moves them); heavy ones
  are dark violet banded in bronze with glowing teal spirals (only the Tether Glove moves
  them).
