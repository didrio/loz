# Sallowmere (the second region) and the Old Weir (its dungeon): design

Status: **design approved by the owner** (2026-11-06, T5). Nothing is built yet. All names are working names. The
build is tickets T8–T16 in [tickets.md](tickets.md). This doc holds what the data and code won't: the place, the item, the
dungeon's idea, the enemies, the boss, and the story beats. Keep it current as the tickets land, and move details into
their topic docs (combat.md, dungeons.md, bells.md) once they're built.

**Owner's calls (2026-11-06):**
- **The land:** drowned lowlands.
- **The item:** an ember lantern.
- **The story:** only **hints of the adults**: no rescue yet, no camp NPC, and no "what the exile saw" framing.
- **The size:** **a smaller dungeon in a fuller region**. The dungeon is about 16 rooms (45–60 min), and the region has a
  town and side errands, about 2 hours in all. (The shrine is 25 rooms and 75–90 min.)

## The place

The road on past the Waybell's canyon (where the Northpass's far `Bounds` wall stands now) drops out of the mountains
onto **Sallowmere**: a river plain that flooded and never drained. Willows and reeds, drowned fields with fence tops
showing, causeways on old embankments, half-sunk barns. It's wide and flat after the canyon, grey-green by day and
silver by night.

- **The descent:** a switchback road down from the canyon. It gives the first view over the whole mere.
- **Stiltwick:** the town, rebuilt on stilts and rooftops above the flood, joined by boardwalks and moored boats. It holds
  most of the region's people, a trader, and the region's bell post.
- **The Old Weir:** a great stone lock and weir across the river at the far end of the mere. This is the dungeon. Its
  gates are jammed and the water behind it keeps rising. **At night the Weir glows across the water** (the boss's lure),
  seen from town.
- **The Lightless Cut:** a tunnel through a hill on the mere's north side, choked with dry reed and root and pitch dark
  inside. It's the way on to region 3 and needs the lantern.
- **Off the road:** islands and drowned farms with chests, a bell trial, and reed thickets the lantern burns (some hide
  chests).

**Water** (new for the overworld; built, see engine.md "Physics"):
- **Shallow water** (up to about knee or waist height) is wadeable but slows Wren, and Mudlurks hide in it.
- **Deep water is a fall:** half a heart, and Wren goes back to the last dry ground, like a pit (`TrialFalls`). There's
  no swimming, and none is planned for this region.
- The surface is a flat plane, with the depth read from the terrain. Sallowmere sets `RegionDef.waterLevel` for its own height
  and builds its own plane (`buildWater` is the valley's, 420 m square at `WATER_Y`).

**Building rules** (scaling checklist):
- The region gets its own seed (`regionRng('sallowmere')`).
- Its streamed build is spread over frames, because it's bigger than the Northpass.
- Its content goes in its own `content/sallowmere.ts`.

## The item: the Ember Lantern

A small iron lantern with a coal of the old fire, found mid-dungeon like the glove. **It's passive: no button and no item
selector.**
- **Light:** hung on Wren's belt, it lights dark rooms and the Lightless Cut around her. It's one constant point light,
  so the light count stays fixed (see the perf note in [roadmap.md](roadmap.md)).
- **Kindle:** at a brazier, Interact says "Kindle". Braziers are a new switch style with `needs: lantern`. A lit brazier
  stays lit (saved) unless a puzzle says otherwise.
- **Burn:** at a reed or root barrier, Interact says "Burn". These are the existing `{ item: 'lantern' }` door lock, plus
  overworld reed thickets (saved like thorns).
- **Douse:** a fall into deep water puts the lantern out until Wren relights it at any fire (a brazier, a camp fire, a
  hearth). So getting the light past deep water is a puzzle, and the dungeon's water levels are its other half.

**Why passive:** the glove already owns the `item` button (F / Y / "Glove"). Interact needs no new binding and no touch
button, and it defers an item selector until a third active item exists (a roadmap line).

**What it opens:**
- the Weir's own locks after the mid-point;
- **the Lightless Cut** (the way out of the region);
- optional spots: thickets with chests in Sallowmere, and **Corwin's dead lamps in the Gloaming Hollow back home**, which
  can be relit for a reward (to design; a backtracking nod).

## The dungeon: the Old Weir

About **16 rooms on 3 floors** (wings), about **4 colored keys**, about **9 chests**, **4–5 fight rooms**, about **25
enemies**, and about 70 gems. T15 designs the rooms as `DungeonDef` data and writes the build tickets.

| Floor | Wing | Look (new `theme`s in `decor.ts`) | Mechanic |
|---|---|---|---|
| 0 | **The Wharf Halls** | wet timber, rope, dead lamps | the first sluice, barges, the way in |
| -1 | **The Sluices** | dark brick, pipes, basins | flooding and draining basins; dark rooms after the lantern |
| 1 | **The Gatehouse** | weathered stone, great wheels | the wheels that set the big basins; the boss key |

**The gimmick: water level.** **Sluice wheels** (struck or turned) flood or drain a **basin**, two states each.
- **Drained:** the basin floor can be walked, and its low doors open.
- **Flooded:** the basin acts like a pit (deep water, the fall rule), but **moored barges** ride up with the water to the
  high doors.
- **Teach:** one basin and one wheel by the entrance.
- **Test:** two basins that need opposite states.
- **The item:** the lantern, mid-dungeon.
- **Twist:** carry the light past deep water and into dark rooms. Wickmoths snuff it, and a fall douses it.
- **Exam:** the boss.

**Format and solver work** (T15):
- `basin` as a room feature, a `sluice` switch that toggles, and barges as platforms that follow the water.
- The solver has to track sluice states. Switches are press-once today, and with 2–3 sluices that's 4–8 states.
- **Softlock rule:** every wheel can be turned back, so no state is a trap.

## Enemies

- **Mudlurk** (the region's shallows): a ripple in the water that rises and snaps. A guarded snap dazes it, and the
  daze is the opening. Built with `/add-enemy`.
- **Wickmoth** (the Weir's dark rooms): pale moths drawn to the lantern. They swarm Wren, and one that reaches the lantern
  snuffs it. One hit each.
- **Reedwight** (the Weir): a figure of wet bound reeds. The sword scatters it, and it binds itself again after a few
  seconds unless Wren burns the heap while it's down (Interact: "Burn"). This teaches the lantern in a fight.
- Thornlings and Cragstalkers can fill in. No gloomwisps (the blight's).

## The boss: the Lurelight (idea; T16 designs it)

A great drowned eel coiled through the Weir's pipes, a pale body barnacled with lock-iron. **The third ember of the stolen
flame glows as a lure** hanging in front of its jaws. It's what the town sees glowing at night.

- **The arena** is a dark round basin with a ledge, grates in the walls and floor, and four unlit braziers.
- **Phase 1:** it strikes from the grates. The tell is bubbles and the lure's glow coming close. Braziers Wren kindles
  make it recoil, stunned, when it surfaces beside one. Then sword its head. The light also shows where it will rise.
- **Phase 2:** it bursts the sluices and the basin floods higher. Wren turns a wheel to drain it, and the eel is
  stranded, thrashing: sword the lure.
- **Defeat:** the ember drifts free, up and home to the great lantern (**three embers**, `setEmbers(3)`), and a Heart
  Vessel appears. The Weir's gates open, and the mere starts to drain a little (a visible change, to design).
- It uses the shared move system and fairness rules ([combat.md](combat.md)).

## Story beats

**Allowed** (owner, 2026-11-06): the hints of the adults. Story comes through NPC lines, not cutscenes.

- **Stiltwick's people** talk about the flood, the Weir, the light at night and their own lives. They never explain the
  exile, and they don't know the valley's story.
- **Hints of the adults** (Maren, Tobin and Odo vanished when the prism broke):
  - a ferryman saw **three people walk the north causeway at dawn, in step, not answering**;
  - **Maren's purple shawl** hangs snagged on the reeds by the Lightless Cut.
  - Both point further on. Lark and Pip react when Wren comes home (lines to write in T10, or with the Weir's end).
- **The way into the Weir:** an errand chain in Stiltwick (the ferry) opens it. It's designed in its own ticket (T13).
- **The bell:** one bell site in the region ([bells.md](bells.md)'s recipe), with its post in Stiltwick and its trial
  out on the mere.
- **Murmurbuds** stay a valley thing (the keepers' reach), unless the owner wants some here.
- **The trader** in Stiltwick is a gem sink. The ware gets designed in T10.

## World progression

**Decided (T5), built (T6): the world progression solver (`content/progression.ts`), kept lean:
- every gate is data (items, flags, keys, gem prices, bells, area links);
- one test proves a new save can reach the current end.
- It comes before the region while the gates are few. After that, each Sallowmere ticket adds its gates.

The region's chain, for the solver:
1. The Waybell is hung.
2. The road past the canyon leads to the descent, then Stiltwick.
3. The ferry errand opens the way to the Weir.
4. Inside the Weir: the lantern, then the boss.
5. The third ember. The Lightless Cut burns open (region 3).

## Open questions for the owner

- **How an ember of the stolen flame got past the mountains** into the Weir. Nobody in Stiltwick knows, and the doc
  doesn't guess.
- The names: Sallowmere, Stiltwick, the Old Weir, the Lightless Cut, the Ember Lantern, the Lurelight, the Mudlurk, the
  Wickmoth, the Reedwight.
- Whether the region should have a few Murmurbuds.
