# Combat and bosses

The sword, the shield's guard, enemy attacks, hazards, and how bosses are built. Read this
before touching `game/player.ts`, `game/guard.ts`, `game/enemies.ts`, `game/hazards.ts`,
`game/boss.ts` or anything in `game/bosses/`.

## Combat (`game/enemies.ts`, `game/player.ts`, `game/hazards.ts`)

- The sword tests each enemy's **hurtboxes** (spheres; the blade reaches 0.15–2.5 m above
  Wren's feet, 3.1 m for the overhead chop) and prefers higher-`priority` boxes (weak
  points). `Enemy.hurt` answers `hit`, `weak` (weak point), `guarded` (Wren recoils, combo
  ends) or `ignored`. `Game.onSwordHit` turns that into sound, sparks and hit-stop.
- **Defense is the shield, nothing else** (no dodge roll, no stamina). The shield has a
  **guard** of 3 slots (`game/guard.ts`). Every attack is an `Attack` with `damage`
  (half-hearts) and `guard` (slots a block knocks down: 1 light, 2 heavy, 3 crushing);
  TypeScript requires both, and each enemy keeps its numbers in one attack sheet
  (`THORNLING_LUNGE`, the Lamplighter's `ATTACKS`). Each knocked-down slot returns on its
  own after 2 s, **but only while the shield is lowered** (its timer pauses, not resets,
  while it's up): the shield is very safe in short bursts, then you back off and lower it
  to recover, so even slow, light attackers eventually break a shield that's never dropped.
- Blocking with fewer slots up than the cost **breaks the guard**: that hit is still
  stopped, but Wren is knocked back and **staggered for 2 s**: no shield, no jumping, and
  movement drops to a crawl at 10% speed (`STAGGER_SPEED`; the sword still swings; the
  shield droops and flashes red; slots refill meanwhile since it's down). The shield stays
  up through jumps (Space works while holding Shift).
- The **guard gauge** floats beside Wren on screen (three 10 px bars: green up, gray down
  and refilling from the bottom, red when broken), like a stamina wheel. It appears when
  the guard takes damage and stays until a second after it's full again
  (`Guard.gaugeVisible`, positioned by `Game.guardGaugePosition`).
- **What enemies notice** (thornlings; follow this for every new enemy): Wren must be on
  the same level (not through a floor), in a clear line of sight (a World-layer ray, so not
  through walls), and, if the enemy has a `territory` (dungeon enemies: their room),
  inside it, and its idle wandering stays inside its territory too. A chase is dropped after 2.5 s without seeing Wren, when Wren leaves the
  territory, or when the enemy strays 24 m from home (the leash); it walks home and won't
  notice Wren again for 3 s. Attacks only land at the same height. Before this, a
  thornling one floor below the shrine's nave chased Wren from under the floor and hit
  through it (`game/thornling.test.ts` reproduces it).
- **Lock-on** (`game/lockon.ts`) picks only enemies within 20 m, roughly where the camera
  looks, on the same level and in plain sight; it lets go when the target dies, gets
  25 m away or ends up on another floor.
- Attacks on Wren go through `hitPlayer(from, attack)`: the shield stops frontal hits
  unless `unblockable`; `groundOnly` attacks (shockwaves) miss while airborne; the 1.2 s
  after a hit is untouchable. Results: `hit` / `blocked` / `broken` / `miss`.
- **Drinks** (`game/drinks.ts`): the Ember Tonic doubles sword damage for 30 s (the blade
  glows; a bar drains under its HUD slot), the Restoring Draught refills every heart. Each is
  single-use until Wren dies, when every drink found refills.
- Possible future depth, not built: a **perfect block** (raise the shield just before
  impact) that costs no guard. The guard break deliberately stops the hit that broke it:
  the punishment is the stagger, not damage on top.
- `Hazards` holds attacks that outlive their move: `shockwave` (unblockable: jump it) and
  `orb` (homes briefly; the shield pops it for 1 slot). Cleared on respawn and area change.

## Bosses (`game/boss.ts`, `game/bosses/`)

A boss is an `Enemy` with states `dormant → intro → fight → dying`. Every attack is a
`Move` with three steps, **windup** (the telegraph) → **active** (can hurt) → **recover**
(open to punishment), plus a weight by distance and an optional cooldown. The base class
picks moves (never the same one three times running unless it's the only option), runs
the steps, turns at `turnRate`, handles HP phases (`phases: [0.5]` → `phaseMove` plays,
invulnerable), follow-ups (`later`, `queue`, `skipStep`), per-move `scratch` notes,
and `reset()` when the player dies mid-fight (full HP, dormant, arena re-armed). A
concrete boss provides its rig + `animate`, `moves()`, `hurtboxes()` (from rig nodes, so
weak points are reachable only when the pose brings them down), `isGuarding` and
`damageMultiplier`. Content spawns it in `AreaContent.start`, arms its `BossArena`, runs
the intro script on the arena trigger (`wake()` → `until(ready)` → `engage()`), and its
`onDefeated` runs the defeat script. The HUD bar, darkening (`gloom`) and boss music
follow whichever boss is engaged. `game/boss.test.ts` shows how to test a boss headlessly.

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
