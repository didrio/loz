# Dungeons

Dungeons are written as **data** (`DungeonDef`), checked automatically, and (soon) built
into 3D from that data. Never hand-place dungeon geometry in code: write the data, run
`npm run map -- <id>`, read the map and the problems, iterate.

Code: `src/world/dungeon/` (`format.ts` types and geometry helpers, `validate.ts`
structure checks, `solve.ts` the logic solver, `map.ts` the text map, `index.ts` the
`DUNGEONS` registry and `checkDungeon`, `example.ts` the reference dungeon, `defs/` the
game's dungeons: `shrine.ts`; `build.ts` the 3D builder, `pieces.ts` its doors, stones,
switches, tablets and sconces). Per-dungeon design notes: [shrine.md](shrine.md).

## The workflow

1. Sketch the dungeon's flow first (in words or with the owner): what's the gimmick, where
   are the keys, what's the route, where does the boss key sit.
2. Write the `DungeonDef` in its own file (`src/world/dungeon/defs/<id>.ts`) and add it to
   `DUNGEONS` in `index.ts`. Write its design notes in `docs/<id>.md`.
3. `npm run map -- <id>`: prints the map of every floor, the chest contents and locked
   doors, and any problems. Fix until it says "No problems."
4. `npm run check`: the tests validate and solve every dungeon in `DUNGEONS`. A malformed
   dungeon, an unfinishable one, a softlock or unreachable content fails the build, with
   the map in the failure message.
5. Look at it in 3D: `npm run look -- dungeon` captures a few rooms at eye level and a
   top-down view of every floor (compare it with the text map). In the dev console,
   `embervale.loadArea('shrine')` walks you straight in.

## The format, in short

See `format.ts` for every field with comments, and `example.ts` for a dungeon using all
of them. Units are meters, +x east, −z north (same as the overworld).

- **Rooms** are rectangles on a floor (`floor: 0` entrance level, `1` up, `-1` down) with a
  northwest corner (`x`, `z`) and a size (`w` along x, `d` along z), at least 4×4 m.
  Rooms on the same floor may share walls but not overlap. A room with enemies counts as
  cleared once they're beaten (chests can `appear` on that). `features`: `pit`, `block` (raised), `pillar`,
  positioned relative to the room.
  Rooms also take `trial: true` and `platforms: PlatformDef[]` for bell trials (see [bells.md](bells.md)): falls in a trial room return Wren to the last checkpoint ledge (no damage, `TRIAL_RULES`); platforms are relative to the room's NW corner and checked by the validator.
- **Doors** join two rooms. A normal door needs the rooms to share a wall (one room's edge
  exactly on the other's) long enough for the doorway (default 3 m wide, plus 0.5 m of
  wall at each end); it sits in the middle of the shared wall unless `offset` says
  otherwise. `kind: 'stairs'` joins rooms on adjacent floors whose footprints overlap;
  `kind: 'drop'` is a hole from a room down into the overlapping room on the floor below
  (always one-way; good for shortcuts). Stairs take `at` (the foot, relative to the
  *lower* room) and `up` (the direction you climb); a flight is `STAIR_RUN` = 12 m long and
  needs 1 m of clear floor at each end, so the rooms must overlap by at least 14 m that
  way. Two flights can share a footprint in separate lanes (the shrine's stairwell). `oneWay: true` is passable only `from` → `to`
  (ledges). A bar that lifts from one side and then stays open is better modeled as a
  switch door with the switch on the far side (see `naveNorth` in the shrine).
- **Locks**: `{ key: color }` (the small key of that color, `crimson`/`azure`/`jade`/`violet`/`amber`: `KEY_COLORS` in `format.ts`; spent on use, the door stays open), `'boss'` (needs the boss key),
  `{ switch: id }` (opens when that switch is pressed), `{ switches: [ids] }` (opens when
  all of them are pressed), `{ item: id }` (needs a tool).
- **`theme`** (per room): `sandstone` / `marble` / `moss` / `basalt`, the look of its
  floor, walls, light and decoration (`decor.ts`). Walls take the theme of the floor's
  rooms, so keep one theme per floor (a wing). Decoration in rooms with stones is
  wall-mounted or flat; free-standing statues only go where no stone can slide.
- **Things** sit in a room at `at` (relative to the room's corner): `chest` (with `loot`:
  `{ key: color }`, `bossKey`, `{ item }`, `{ gems }`, `{ flask: 'life' | 'attack' }` (a full flask), optionally
  `appears` after a switch, after several (`switches`), or once a room is cleared), `switch` (`style: 'crystal'` struck
  with the sword, or `'plate'` held down by a stone; `needs: item` if pressing it takes a
  tool), `stone` (a 2 m wakestone, `heavy` ones only move with the glove; stones and
  plates go at odd coordinates, the centers of 2 m cells), `enemy` (`type` is an enemy
  class name like `thornling`), `boss` (stands in the middle of its room), `sign`,
  `landmark` (a big lopsided statue to orient by: `style` `lanternKeeper` / `watcher` /
  `fallenKeeper`, `facing` a yaw; a 3 m square, solid like a pillar, so the grid blocks the
  cells it touches and the validator rejects one on a doorway approach, a stair, a pit, a
  pillar or another thing; models in `landmarks.ts`, emissive only, no light),
  `bellPost` (a keeper's bell post: `bell` is the bell that fits it, `facing` a yaw, default
  toward the room's center; it gets an entrance named by its id, where travelers arrive) and
  `bell` (a bell waiting at the end of its trial, on a plinth). Both are solid (a 1 m
  footprint: stones stop against them, wall decoration keeps a step clear); a dungeon can hold
  one of each per bell. See [bells.md](bells.md).
- **`music`**: the dungeon's theme (a mood in `core/tracks.ts`), played while inside.
- **`entrance`** (room, spot, facing) and **`goal`** (the room that finishes it, normally
  the boss room).
- **Ids** are unique across the whole dungeon. Content binds scripts and saved state to
  them, namespaced by the dungeon id (e.g. the chest `hallChest` in `shrine` will save as
  `shrine.hallChest`).

## Vertical and clearance rules (the validator enforces them)

- Floors are `floorHeight` (8 m) apart. A floor slab is 0.5 m thick below the walking
  surface, a ceiling slab 0.5 m above the room, and the default room height (7 m) puts the
  ceiling flush against the floor above, so stair shafts and drop holes are closed tubes.
  A room under a shaft must have the default height; a taller room is fine only where
  nothing is built above it (the boss hearth).
- Holes (pits, drops, stair shafts) and flights of stairs in a room can't overlap each
  other, blocks or pillars; nothing stands on them; a pit can't open into a room below
  (use a drop).
- Every doorway needs 1.5 m of clear floor in front of it on both sides (no stairs, holes,
- Enemies start on level ground: not on a flight or its top shaft, and 1.5 m clear of a flight (the validator fails both).
  blocks or pillars there). This caught a real bug: the nave's east door first opened into
  the side of a staircase, leaving a gap narrower than Wren.

## The builder (`build.ts`)

`new DungeonArea(physics, def)` is an `Area` (indoor: see [engine.md](engine.md)). Each
room gets a floor slab minus its holes (with 2 m seams: the wakestone grid), walls on its
edges (shared walls built once, door gaps cut, lintels over doorways), a ceiling minus the
shafts coming up through it, pillars and blocks, a warm point light and two wall sconces.
Pits have a floor 3 m down. Stairs are solid steps (looks, side collisions) with one smooth
ramp collider on top, and railings round the shaft upstairs except at the top. Doors are
`DungeonDoor`s styled by their lock (open frame, small-key slab, boss slab, bars for switch
doors; item locks have no door, the obstacle is in the room), plus an open doorway (frame only,
black beyond) in the wall behind the entrance spot: it never closes. Things become `Chest`s (hidden until they
`appear`), `DungeonSwitch`es, `Wakestone`s and tablets (signs are interactables); enemies
and the boss become `spawns` for content to create. Floors are merged separately so
`showFloor(n)` can show one floor without ceilings (the top-down look). `roomAt(pos)` and
`floorAt(y)` tell content where Wren is. **Careful: `floorAt` rounds to the nearest floor**,
so halfway up a staircase Wren counts as on the *other* floor. Fine for "which room is
Wren in", wrong for "is Wren below the floor": use `inPit(pos)` (inside a pit's outline,
below its floor) for falls. (Using the nearest floor made every staircase hurt halfway.)

## Wakestones, plates and pits (`grid.ts`, `puzzle.ts`, `DungeonArea.moveStone`)

**Bounce-back**: a light stone struck against something solid (a wall, pillar, another
stone, a chest) pops one cell back toward Wren, who's knocked back out of the way (no
damage), if the cell behind Wren is open floor. So no stone can ever get stuck against a
wall. **Hold plates** (`hold: true`) are down only while a stone rests on them; whatever
waits on them (a door's `switches`, a chest's `appears: { switches }`) needs them all held
at once, then latches for good. **Every stone must matter**: the checker removes each stone
in turn and re-solves the room (with and without the glove); if nothing changes, the stone
"serves no purpose" and the build fails (doorway-blocking stones and `role: 'bridge'`
stones are exempt).

Each room is a grid of 2 m cells (`roomGrid`): pillars, blocks, stairs, shafts and drop
holes are solid; pits are pits; the cells inside doorways, the entrance and stair/drop
landings are where Wren can arrive. A sword strike pushes the nearest stone in front of Wren
one cell away (along whichever axis Wren is more squarely behind it); it won't move into
anything solid, another stone or Wren. Pushed into an open pit it drops in, its top flush
with the floor: that cell is floor now. Onto a floor plate, the plate presses (and stays
pressed: a switch). Heavy stones only move with the Tether Glove's pull (milestone 5;
`moveStone` already serves both). Leaving a room **with a plate** puts its stones back
(`resetRoom`), except stones in pits or on pressed plates, so a wrong push can never ruin a
puzzle; elsewhere a moved stone stays moved (the shrine's doorway stone doesn't come back
after every death). Stone positions aren't saved; pressed plates are.

The **puzzle checker** (`solveRoomPuzzle`, part of `checkDungeon`) searches every
arrangement a room's stones can reach (pushes, plus pulls where the glove is needed: a plate
that `needs` it or a heavy stone in the room) and proves every plate can get a stone and
every stone that starts in front of a doorway can be moved aside. Stones and plates must be
at odd coordinates (cell centers) in rooms of whole cells. Chests (present from the start)
in rooms with stones or pits must be reachable too (e.g. across a pit you fill), and
chests block stones.

## What the solver guarantees

`solveDungeon` is one greedy sweep (walk through open doors, open chests, press switches,
use items and keys, repeat until nothing changes), because **colored keys can't be misspent**:
each color has exactly one chest and one door (the validator fails a dungeon that breaks that),
so there is no order of choices to search and no softlock from keys. It reports:

- **completable**: the goal room is reached,
- **unreachable**: rooms or things nothing reaches (forgotten doors, chests behind nothing, a
  key whose chest sits behind its own door),
- **route**: the key doors in the order a playthrough can open them (handy when describing the
  dungeon).

Its simplifications: switches stay pressed, a plate counts as pressed once its room is
reached (plus its `needs` item), enemies can always be beaten, rooms count as
cleared once reached, items work anywhere. Whether a room's stones can actually reach its
plates is a per-room puzzle question for a separate puzzle checker (planned with the
wakestones; see [shrine.md](shrine.md)). If a dungeon needs more (a timed
switch, a key you can lose, a door that re-locks), extend the solver first, with a test.

## Reading the text map

One character is 1 m east–west, one line is 2 m north–south, north is up. `#` wall, gaps
are open doorways, `k` small-key door, `B` boss door, `s` switch door, `i` item door,
`> < ^ v` one-way doors (pointing the way you can go), `U`/`D` stairs up/down, `v`/`*` a
drop hole (on the floor above) and where it lands (below), `@` entrance, `C` chest, `S`
crystal switch, `P` floor plate, `%` wakestone, `&` heavy wakestone, `e` enemy, `X` boss,
`?` sign, `L` landmark statue, `Y` bell post, `A` bell, `O` pit, `=` block, `I` pillar. Room ids are written in empty space inside each room. Example (`npm run map --
example`):

```
###############BBB###############
#west     #hall       #east     #
#  e      k  I     I  s         #
#    C    k     C     s    U    #
#      e  #           #         #
#         #           #         #
####vvv########   ###############
#cOOOar   #e?try      #
# OOO     >           #
#         #           #
#      S  #     @     #
#######################
```

## Design guidelines for our dungeons

- Every dungeon has one **gimmick** it teaches, tests, then twists (genre convention; the
  gimmick itself must be original to this game).
- Prefer loops (a one-way door back to an earlier room) over long backtracking.
- A room of enemies or a switch is a better gate than a third small key.
- Keep `npm run map` output readable: that's also a sign the layout is readable to players.
