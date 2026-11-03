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
  charge): with the **Stoneward Tunic** (`village.stonewardTunic`, 100 gems from Odo,
  `Player.setStoneward`) Wren takes `ceil(damage / 2)` from it, and nothing else changes.
  TypeScript requires both, and each enemy keeps its numbers in one attack sheet
  (`THORNLING_LUNGE`, the Lamplighter's `ATTACKS`). Each knocked-down slot returns on its
  own after 2 s, **but only while the shield is lowered** (its timer pauses, not resets,
  while it's up): the shield is very safe in short bursts, then you back off and lower it
  to recover, so even slow, light attackers eventually break a shield that's never dropped.
- Blocking with fewer slots up than the cost **breaks the guard**: that hit is still
  stopped, but Wren is knocked back and **staggered for 2 s**: no shield, no jumping, and
  movement drops to a crawl at 6% speed (`STAGGER_SPEED`), and **no sword** (owner's call,
  2026-11-02: a swing's lunge carried Wren out of the crawl). The shield droops and flashes
  red; slots refill meanwhile since it's down. The shield stays
  up through jumps (Space works while holding Shift).
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
  notice Wren again for 3 s. Attacks only land at the same height. Before this, a
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
  then `SENTINEL_SWING` (2 half-hearts, guard 2) after a ~1 s overhead windup. Its reach
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
- **Lock-on** (`game/lockon.ts`) picks only enemies within 20 m, roughly where the camera
  looks, on the same level and in plain sight; it lets go when the target dies, gets
  25 m away or ends up on another floor.
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
  flies straight at where Wren is; `tetherStone` catches one mid-air; `onLand` leaves rubble). Cleared on respawn and area change.
  Every orb, and every Gloomwisp, casts a blob shadow (`GroundShadow` in `render/shapes.ts`):
  a dark disc on the ground below, smaller and fainter the higher it flies, so its distance
  reads at a glance. Give anything new that floats one too.

## Bosses (`game/boss.ts`, `game/bosses/`)

A boss is an `Enemy` with states `dormant → intro → fight → dying`. Every attack is a
`Move` with three steps, **windup** (the telegraph) → **active** (can hurt) → **recover**
(open to punishment), plus a weight by distance and an optional cooldown. The base class
picks moves (never the same one three times running unless it's the only option), runs
the steps, turns at `turnRate`, handles HP phases (`phases: [0.5]` → `phaseMove` plays,
invulnerable), follow-ups (`later`, `queue`, `skipStep`), per-move `scratch` notes,
and `reset()` when the player dies mid-fight (full HP, dormant, arena re-armed). A
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
bend toward Wren for their first 0.7 s (`homing`). `Boss.walkable` keeps a boss off drops. Sweep, Volley and Grind round out phase 1.

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
- Damage: 1–2 half-hearts per hit for an early boss (Wren starts with 3 hearts).
