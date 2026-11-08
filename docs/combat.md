# Combat and bosses

The sword, the shield's guard, enemy attacks, hazards, and how bosses are built. Read this
before touching `game/player.ts`, `game/guard.ts`, `game/enemies.ts`, `game/hazards.ts`,
`game/boss.ts` or anything in `game/bosses/`.

## Combat (`game/enemies.ts`, `game/player.ts`, `game/hazards.ts`)

- The sword tests each enemy's **hurtboxes** (spheres; the blade reaches 0.15–2.5 m above
  Wren's feet, 3.1 m for the overhead chop) and prefers higher-`priority` boxes (weak
  points); the choice is `swordTarget` in `game/player.ts`. `Enemy.hurt` answers `hit`,
  `weak` (weak point), `guarded` (Wren recoils, combo ends) or `ignored`. `Combat.onSwordHit`
  (`game/combat.ts`) turns that into sound, sparks and hit-stop.
- **Guards are diegetic** (owner's call, 2026-11-02: no tint or invulnerability timers). An
  enemy's weapon or shell is an **armor** hurtbox (`armor: true`) placed on the model; the
  sword bounces off it only when it's nearer to Wren than the part she'd otherwise hit. So
  a swing straight at the maul clanks, one that gets past it from an angle lands. Keep
  armor spheres tight to the mesh, and answer `guarded` for that part in `hurt`.
- **Defense is the shield, nothing else** (no dodge roll, no stamina). The shield has a
  **guard** of 3 slots (`game/guard.ts`). Every attack is an `Attack` with `damage`
  (half-hearts) and `guard` (slots a block knocks down: 1 light, 2 heavy, 3 crushing);
  An attack may also be `stone: true` (statues, shells: the Sentinel's swing, the Shellback's
  charge): with the **Stoneward Tunic** (`village.stonewardTunic`, 50 gems from Odo,
  `Player.setStoneward`) Wren takes `ceil(damage / 2)` from it, and nothing else changes. Shockwaves
  take `stone` too (`ShockwaveOptions.stone`). **Owner's call, 2026-11-03: stone enemies hit hard so the tunic is
  felt**: the Sentinel 4 half-hearts (tunic 2), the Shellback 2 (1), and **every Gravelheart attack 4 (two
  hearts; tunic 2)**. Wren has 4 hearts at the shrine, so it's two hits, or four in the tunic. The Lamplighter
  and the non-stone enemies are unchanged (the tunic does nothing against them).
  TypeScript requires both, and each enemy keeps its numbers in one attack sheet
  (`THORNLING_LUNGE`, the Lamplighter's `ATTACKS`). Each knocked-down slot returns on its
  own after 2 s, **but only while the shield is lowered** (its timer pauses, not resets,
  while it's up): the shield is very safe in short bursts, then you back off and lower it
  to recover, so even slow, light attackers eventually break a shield that's never dropped.
- Blocking with fewer slots up than the cost **breaks the guard**: that hit is still
  stopped, but Wren is knocked back and **staggered for 2 s**: no shield, no jumping, and
  movement drops to a crawl at 6% speed (`STAGGER_SPEED`), and **no sword** (owner's call,
  2026-11-02: a swing's lunge carried Wren out of the crawl; the swing's ~0.36 m step is cancelled near thorns/scars, ledges, signs, people and Murmurbuds: `game/lunge.ts`, owner's call 2026-11-04). The shield droops and flashes
  red; slots refill meanwhile since it's down. The shield stays
  up through jumps (Space works while holding Shift).
- **Shield surfing** (`game/surf.ts`, owner's design 2026-11-03): once Lark has given Wren the idea
  (`village.surfIdea`), landing from a jump (at least `SURF_MIN_AIR` in the air) with the shield held
  puts her on it, **outdoors only** (`!area.indoor`). She gets the full `SURF_SPEED` (20, about 2.4× running speed) at once on landing
  (owner's call 2026-11-04: a push, not an engine). After that the speed only **glides down**
  (`surfSpeedNext`: time constant `SURF_GLIDE` 1.2 s, `SURF_BRAKE` 0.6 s with the stick let go) and never rises, so holding a direction doesn't
  keep it up; below `SURF_MIN_SPEED` (5) the ride ends. One ride is about 18 m; to go further she jumps and lands on the shield again.
  The stick steers the direction with a soft carve. A jump is a hop that keeps the ride. Riding off a ledge works too. Slopes act like running.
  **It isn't a guard**: while surfing `shielding` is false, so every hit lands (normal damage and knockback)
  and knocks her off. The guard gauge is frozen (it neither drains nor refills). The ride ends at once on
  letting go of the shield, lock-on, a swing (which then starts), wading-depth water, a hit, the glove or a
  guard break. With surfing learned, raising the shield in mid-air doesn't slow the jump to the guard walk.
  `PlayerEnv.onSurf` drives the dust (a puff every ~1.5 m) the mount scrape (`sfx.surf`) and, via `onSurfSound`, the looping ground scrape (`sfx.surfScrape`, volume and pitch follow speed, grounded only). The first ride
  sets `village.surfTried`.
- The **guard gauge** floats beside Wren on screen (three 10 px bars, gray behind; the fill
  is the same bright green for up and refilling slots, rising from the bottom; a slot that
  is down turns its fill red while the shield is up, `Guard.paused`, since it won't refill
  until it's lowered; the whole gauge goes red when broken), like a stamina wheel. It appears when
  the guard takes damage and stays until a second after it's full again
  (`Guard.gaugeVisible`, positioned by `Game.guardGaugePosition`).
- **What enemies notice** (thornlings; follow this for every new enemy): Wren must be on
  the same level (not through a floor), in a clear line of sight (a World-layer ray, so not
  through walls), and, if the enemy has a `territory` (dungeon enemies: their room),
  inside it, and its idle wandering stays inside its territory too. A chase is dropped after 2.5 s without seeing Wren, when Wren leaves the
  territory, or when the enemy strays 24 m from home (the leash); it walks home and won't
  Dungeon ground enemies also have a *walkable* check (`setWalkable`, `GroundEnemy`): the room minus its stairs. They never step onto stairs (a chaser stops at the foot) but still notice Wren standing on them.
  notice Wren again for 3 s. **Safe ground** (`Area.safeGround`, the village ring + 6 m: `inVillageGuard`, owner's call
  2026-11-04): an enemy ignores Wren standing on it (no notice, a chase drops at once), and night wisps won't chase her
  there either; field spawns already keep 10 m out. Attacks only land at the same height. Before this, a
  thornling one floor below the shrine's nave chased Wren from under the floor and hit
  through it (`game/thornling.test.ts` reproduces it).
- **Ground enemies share a base**, `GroundEnemy` (`game/enemies.ts`): the notice rules above
  (`sees`, `lostTrack`), `level` (same height, so an attack can land), `walk` (gravity +
  knockback), `inFront` (for shields and shells). A new walking enemy extends it, gets an
  attack sheet and a `deathColor`, and gets a test file built on `game/enemyTestEnv.ts`.
- **Reaction time**: a wandering ground enemy charges only after seeing Wren for `REACTION`
  (0.9 s, `GroundEnemy.spot`), so walking into a small room gives a moment to read it.
- **Dozing Sentinel** (`game/sentinel.ts`): a statue until Wren comes within 5 m in sight
  (or hits it: no damage, the stone rings and it wakes). 1.1 s grinding wake, slow chase,
  then `SENTINEL_SWING` (4 half-hearts, guard 2) after a ~1 s overhead windup. Its reach
  comes from the model, not a padded hitbox: a long haft, the arms pushing out 0.35 m and
  a 0.6 m lunge during the blow; it catches Wren in a strip ±0.8 m either side of its line,
  out to 3.1 m (`SWING_REACH`, `SWING_HALF_WIDTH`). History: 3.1 m / ±1.2 rad missed
  point-blank; 4.3 m / ±90° then hit far too easily (owner, 2026-11-02). Then 1.6 s stuck
  with the maul in the floor. The maul held out in front is armor (`MAUL_ARMOR`): straight
  at it, hits clank; from ~60° off its line, or while the maul is raised (windup) or in the
  floor (recovery), they land. 6 HP. Asleep it isn't targetable, so lock-on doesn't give
  the statues away, and a hit only wakes it. Once awake it stays awake and guards its spot.
- **Shellback** (`game/shellback.ts`): no soft face: the shell comes down over its front
  with two eye holes (the eyes narrow when it tucks). The shell is armor (`SHELL_ARMOR`,
  front and sides to ~75° off its facing); its back feet and tail take hits. It
  turns slowly (circling at a run gets past the shell), tucks in for 0.6 s (the tell), then
  charges ~5 m (`SHELLBACK_CHARGE`: 1, guard 1). After a charge it skids 1.3 s unable to
  turn; 1.9 s if the shield stopped it. Running into another enemy stops the charge dead (it skids
  in place; no damage to the other, no shoving; `Character.blockedBy`). 4 HP.
- **Cragstalker** (`game/cragstalker.ts`): a lean hide-and-stone hunter that guards the Waybell across the Northpass's
  canyon. Very aggressive (owner's call, 2026-11-03: the first tuning was far too easy): it notices Wren from 22 m, closes at
  8 m/s, circles at ~4 m, waits only 0.15-0.5 s, then drops into a **crouch** (0.55 s, belly low, eyes bright amber: the tell) and
  **lunges** ~8 m (`CRAGSTALKER_LUNGE`: 3, guard 2, stone: 2 in the tunic), **aimed where Wren stands when the crouch ends**, so a
  sidestep dodges it. After a lunge it pants 0.6 s (the opening; 1.5 s, dazed, if the shield stopped it), and if Wren is still
  within 4.5 m it follows up with another crouch 55% of the time (a combo; every lunge keeps the full tell). No armor: any sword
  hit lands; 6 HP, a 0.25 s stagger when hit. **A lunge stops dead the moment it touches Wren** (the claws land, or the shield
  takes it and it is thrown back dazed) **or another enemy** (no damage to it, no shoving it either way; `Character.blockedBy`), so two of
  them never push each other. The pass has two (`CRAGSTALKERS_AT`, owner's call: one was too easy). It stays on the canyon's far side (`setWalkable`) and gives up like any ground
  enemy (leash, lost sight). Not yet judged in play (owner).
- **Lock-on** (`game/lockon.ts`) picks only enemies (and closed Murmurbuds: anything that is a
  `LockTarget`) within 12 m and 60° either side of where the camera looks (anything within 3 m counts even behind), on the same level and in plain sight
  (owner's call, 2026-11-08: it had picked far and sideways targets); it lets go when the target dies (a bud opens), gets 18 m away or ends up on another floor.
- Attacks on Wren go through `hitPlayer(from, attack)`: the shield stops frontal hits
  unless `unblockable`; `groundOnly` attacks (shockwaves) miss while airborne; the 1.2 s
  after a hit is untouchable. Results: `hit` / `blocked` / `broken` / `miss`.
- **Flasks** (`game/flasks.ts`): two exist, found full; each holds one potion. The attack
  potion doubles sword damage for 30 s (the blade glows; a bar drains under the flask row),
  the life potion refills every heart (refused at full hearts, so it isn't wasted). Drinking
  empties the flask; death does not refill it (and ends an attack potion). Odo refills an
  empty flask with either potion for 20 gems (`REFILL_PRICE`).
- Possible future depth, not built: a **perfect block** (raise the shield just before
  impact) that costs no guard. The guard break deliberately stops the hit that broke it:
  the punishment is the stagger, not damage on top.
- `Hazards` holds attacks that outlive their move: `shockwave` (unblockable: jump it) and
  `orb` (homes briefly; the shield pops it for 1 slot) and `stone` (a thrown wakestone: hovers, then
  flies straight at where Wren is; `tetherStone` catches one mid-air; `onLand` leaves rubble). Cleared on respawn, area change and when the boss that made them dies.
- **Standing hazards**: the blight's thorns and scars. `Area.thornAt(x, y, z)` names the point a shove should come
  from, for the clump Wren touches or the scar underfoot (overworld only), and `Combat.update` hits her with
  `THORN_ATTACK` (2 half-hearts, unblockable, knockback 10) from there (a clump's middle; just inside a scar on her
  side), so she's shoved out; the usual 1.2 s of invulnerability stops repeat hits. A sword swing also calls
  `Area.hitThorns` (same reach and arc as cutting bushes, one hit per swing): 5 fell a clump. Details in [world.md](world.md), "The blight".
  Every enemy and boss, every orb and Wren stand on a blob shadow (`GroundShadow` in `render/shapes.ts`; enemies get theirs from
  `Enemy.placeShadow`, which the manager calls each frame, sized by `shadowSize`, default `radius × 1.1`): a dark disc on the ground
  below, smaller and fainter the higher it flies, so a flier's distance reads at a glance. A new enemy needs nothing; give anything
  else that floats one.

## Bosses (`game/boss.ts`, `game/bosses/`)

A boss is an `Enemy` with states `dormant → intro → fight → dying`. Every attack is a
`Move` with three steps, **windup** (the telegraph) → **active** (can hurt) → **recover**
(open to punishment), plus a weight by distance and an optional cooldown. The base class
picks moves (never the same one three times running unless it's the only option), runs
the steps, turns at `turnRate`, handles HP phases (`phases: [0.5]` → `phaseMove` plays,
invulnerable), follow-ups (`later`, `queue`, `skipStep`), per-move `scratch` notes,
and `reset()` when the player dies mid-fight (full HP, dormant, arena re-armed). `sear(dmg)` is damage from no one
(the Lamplighter's dawn burn): no guard, weak point or `onHurt`, but it respects invulnerability and moves the phases. A
concrete boss provides its rig + `animate`, `moves()`, `hurtboxes()` (from rig nodes, so
weak points are reachable only when the pose brings them down; weapons as `armor` boxes,
as the Lamplighter's pole while it's held at the ready), `isGuarding` (say which part parries) and
`damageMultiplier`, and its song (`music`, a `MusicMood`; `BOSS_MOODS` in `core/tracks.ts` lists the
fast-crossfading ones). Indoors, pass `y` (the floor) in its config: floors stack, so the ground is
looked for just above it. Content spawns it in `AreaContent.start`, arms its arena (any `ArenaSeal`:
the hollow's `BossArena`, the shrine's `WardenHearth`), runs
the intro script on the arena trigger (`wake()` → `until(ready)` → `engage()`), and its
`onDefeated` runs the defeat script. The HUD bar, darkening (`gloom`) and boss music
follow whichever boss is engaged. `game/boss.test.ts` shows how to test a boss headlessly.
Dice: `Enemy.rng` (default `Math.random`; tests set a seeded `mulberry32`) feeds move picks and
wandering. `Boss.interruptWith(name)` cuts the current move for another (a stagger).
Boss parts the glove can catch: `Enemy.tetherAt(from, dir)`, asked by `Combat.throwTether` before
stones in flight and `Area.tether`. Gravelheart (`bosses/gravelheart/`): a stuck Hammerfall works one of
three chest plates loose (`loosenPlate`, ~2.4 s); the glove tears it off; with none left it plays
`staggered` (chest open ~3 s, `chest` hits are `weak`, x2), then `replate` pulls new plates from the
wall sockets, then from rubble (it never runs out; rubble crumbles after 7 s). Thrown stones fly at 18 m/s and
bend toward Wren for their first 0.7 s (`homing`). `Boss.walkable` keeps a boss off drops. Sweep, Volley (five stones: owner's call, three were too easy to block) and Grind round out phase 1. **Swipe**
(both phases, d < 3.8 m): a quick high backhand (windup 0.6 s / 0.5 s in phase 2), blockable (cost 2), not jumpable, so crowding it is punished. The Hammerfall ring runs at 15 m/s (was 10.5: too easy to jump).
**Phase 2** (`HOWL` is its `phaseMove`: unhurtable; plates drop away, the ember sinks into the head, `hearth.raiseRing()`,
two hearts drop, Wren and the boss are shoved inside the ring so no tile rises on them): Sweep becomes
`doubleSweep` (two blows 0.75 s apart, cost 2 each: block one, jump the other); **Cairn Roll** (1 s rocking
tell, then it rolls at 13 m/s along the line it locked, `ROLL_SPEED`; sidestep). On reaching the wall (`walkable` says no 0.7 m
ahead) it is dazed 3.2 s and `keyT` = 3 s: the keystone in its back glows and `tetherAt` pulls it (only from
behind or the side), which plays `kneel` (head bowed toward Wren, ember hurtbox `chest` x2, ~2.8 s). With the ember in the
head the plates don't matter any more: Roll -> keystone -> kneel is the only way to hurt it. **Three kneels finish it**
(owner's call, 2026-11-03: one kneel killed it): `Boss.hpFloor()` stops phase two's health from falling under the next third of its
pool (`kneelsSpent`); a kneel that cuts the slice down to the floor ends early, a kneel that doesn't leaves the floor where it was. Phase 2's
`walkable` margin includes the ring (`RING_WIDTH`).

**Exposed tint (reusable):** a boss with a "hit it now" window overrides `Boss.exposed` (Gravelheart: `chestOpen`); the base class
then pulses every `flashMats` material red (`Boss.applyFlash`) so the window reads at a glance. Hit flashes still win. Use it for any
future stagger.

## Fairness rules

Keep these for every boss; they're what "tough but fair" means here:

- Every attack has a readable windup of at least ~0.5 s and a distinct visual tell.
- Every attack has an answer: block (if the guard can afford it), jump or move.
  Guard-crushing attacks (cost 3) get an unmistakable tell (the Lamplighter's eyes flash
  red and it shrieks). Unblockable attacks (shockwaves) must be jumpable.
- Guard costs are the main tuning knob: chains and volleys should sometimes cost more
  than a full guard, so blocking everything isn't a strategy (the Lamplighter's phase-2
  volley fires 8 orbs; a sweep + backhand costs exactly 3).
- Big attacks leave big openings (the slam's stuck hook brings the weak point down).
- Greed gets punished, not forbidden (the Lamplighter spins if you keep hitting its back).
- A phase change drops a couple of hearts; arenas have a few cuttable bushes.
- Damage: 1–2 half-hearts per hit for an early boss (Wren starts with 3 hearts). Gravelheart is the exception: 4 (see above).
