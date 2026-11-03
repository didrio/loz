import * as THREE from 'three';
import { GroundEnemy, Thornling, type Enemy } from '../game/enemies';
import { DozingSentinel } from '../game/sentinel';
import { Shellback } from '../game/shellback';
import type { Script, ScriptApi } from '../game/script';
import type { DungeonProgress, GameState } from '../game/state';
import type { DungeonArea } from '../world/dungeon/build';
import { floorY, lockSwitches, type Condition, type Loot } from '../world/dungeon/format';
import type { AreaContent } from './overworld';

/**
 * The Waking Shrine's content: what its chests hold and say, what unlocks what, how fight
 * rooms seal and open, the seal behind you on the way in and the way out at the end.
 * Everything is driven by the dungeon's data ids and saved per dungeon
 * (`GameState.dungeon('shrine')`), so adding a chest or door to the data needs no code here.
 * See docs/shrine.md for the design and milestones.
 */

const LOOT_TEXT: Record<string, string> = {
  smallKey: 'You found a *Small Key*!\nIt opens one locked door in this shrine.',
  bossKey: 'You found the *Boss Key*!\nIts great teeth fit the door to the shrine\'s keeper.',
  heart: 'A *Heart*! You feel completely restored.',
  restore: 'You found a *Restoring Draught*!\nDrink it ([drinkRestore]) to restore every heart. Once drunk it\'s gone... until you fall, when every drink you\'ve found fills again.',
  attack: 'You found an *Ember Tonic*!\nDrink it ([drinkAttack]) and your sword strikes twice as hard for 30 seconds. Like every drink, it fills again when you fall.',
  tether: 'You got the *Tether Glove*!\nA glowing cord coils around the old leather. It tugs gently toward the shrine\'s stones, as if it knows them.',
};

export function shrineContent(area: DungeonArea): AreaContent {
  const def = area.def;
  const rooms = new Map(def.rooms.map((r) => [r.id, r]));
  /** Enemies by the room they belong to (fight rooms open when theirs are all beaten). */
  const roomEnemies = new Map<string, Enemy[]>();
  /** The fight room whose shutters are down right now. */
  let fighting: string | null = null;
  /** The room Wren was last in (leaving a room resets its stones). */
  let lastRoom: string | null = null;
  /** The last solid floor Wren stood on, where a fall into a pit puts them back. */
  const lastSafe = new THREE.Vector3();
  let haveSafe = false;
  let falling = false;
  let started = false;
  const progress = (s: GameState): DungeonProgress => s.dungeon(def.id);
  const plateRooms = new Set(def.things.filter((t) => t.kind === 'switch' && t.style === 'plate').map((t) => t.room));

  const met = (c: Condition | undefined, p: DungeonProgress) => {
    if (!c) return true;
    if ('switch' in c) return p.switches.has(c.switch);
    if ('switches' in c) return c.switches.every((s) => p.switches.has(s));
    return p.cleared.has(c.cleared);
  };

  /** Chests whose condition just came true pop into view (a puff of light and a chime). */
  const revealChests = (api: ScriptApi) => {
    const p = progress(api.state);
    for (const t of def.things) {
      if (t.kind !== 'chest' || !t.appears) continue;
      const chest = area.chests.get(t.id)!;
      if (chest.present || !met(t.appears, p)) continue;
      chest.setPresent(true);
      api.particles.burst(chest.group.position.clone().setY(chest.group.position.y + 0.8), 0xfff1a8, 24, 3, 0.9, false);
      api.sfx.solved();
    }
  };

  const shuttersOf = (room: string) => area.shutters.get(room) ?? [];
  const alive = (room: string) => (roomEnemies.get(room) ?? []).some((e) => e.alive);

  const lootMessage = (loot: Loot) => {
    if (typeof loot === 'string') return LOOT_TEXT[loot];
    if ('item' in loot) return LOOT_TEXT[loot.item] ?? `You got the *${loot.item}*!`;
    if ('drink' in loot) return LOOT_TEXT[loot.drink];
    return `You found ${loot.gems} gems!`;
  };

  const scripts: Record<string, Script> = {
    // Leaving, once the keeper is beaten and the seal stands open.
    async exit(api) {
      await api.travel('overworld', 'shrineDoor');
    },
  };

  for (const t of def.things) {
    if (t.kind === 'sign') scripts[t.id] = (api) => api.say([{ text: t.text }]);
    if (t.kind !== 'chest') continue;
    scripts[t.id] = async (api) => {
      const chest = area.chests.get(t.id)!;
      const p = progress(api.state);
      chest.open();
      p.chests.add(t.id);
      await api.wait(0.9);
      api.sfx.fanfare();
      api.particles.burst(chest.group.position.clone().setY(chest.group.position.y + 1.2), 0xfff1a8, 30, 4, 1.2, false);
      const loot = t.loot;
      if (loot === 'smallKey') p.keys++;
      else if (loot === 'bossKey') p.bossKey = true;
      else if (loot === 'heart') api.state.heal(api.state.maxHp);
      else if ('item' in loot) {
        if (loot.item === 'tether') {
          // The dungeon's item gets its own moment: close on Wren, the cord flaring teal.
          api.state.items.add('tether');
          const w = api.player.pos, f = api.player.forward;
          api.shot(w.clone().add(new THREE.Vector3(f.x * 2.6 - f.z * 1.2, 1.6, f.z * 2.6 + f.x * 1.2)), w.clone().setY(w.y + 1.2), true);
          api.particles.burst(w.clone().setY(w.y + 1.5), 0x7ff7e8, 40, 5, 1.4, false);
          api.sfx.tetherLatch();
          await api.wait(1.2);
        }
      } else if ('drink' in loot) api.state.drinks.add(loot.drink);
      else api.state.addGems(loot.gems);
      await api.say([{ text: lootMessage(loot) }]);
      if (typeof loot === 'object' && 'item' in loot && loot.item === 'tether') {
        api.releaseCamera();
        api.toast('[item] Throw the Tether Glove at a stone to pull it toward you.');
      }
    };
  }

  for (const d of def.doors) {
    const door = area.doors.get(d.id);
    if (!door || door.style === 'open') continue;
    scripts[d.id] = async (api) => {
      const p = progress(api.state);
      if (door.style === 'small') {
        if (p.keys <= 0) return api.say([{ text: 'It\'s locked tight. A *Small Key* would open it.' }]);
        p.keys--;
      } else if (door.style === 'boss') {
        if (!p.bossKey) return api.say([{ text: 'A heavy door, sealed with a great iron lock.\nIt needs the shrine\'s *Boss Key*.' }]);
      } else {
        return api.say([{ text: 'Iron bars block the way. Something in this shrine must raise them.' }]);
      }
      p.doors.add(d.id);
      api.sfx.clank();
      door.startOpening();
      api.sfx.rumble();
      await api.wait(0.8);
    };
  }

  /**
   * Every enemy in the shrine, fresh: on arrival, and again whenever Wren dies (the
   * checkpoint rule: death keeps your keys, chests and doors, but the shrine refills with
   * enemies). Rooms already cleared stay cleared: their doors don't seal again.
   */
  const spawnAll = (api: ScriptApi) => {
    for (const list of roomEnemies.values()) for (const e of list) api.removeEnemy(e);
    roomEnemies.clear();
    for (const s of area.spawns) {
      // Each enemy minds its own room: it ignores Wren until Wren walks in.
      const inRoom = (pos: THREE.Vector3) => area.roomAt(pos)?.id === s.room;
      // ...and keeps off the stairs (hard to fight on), though it still sees Wren standing on them.
      const walkable = (pos: THREE.Vector3) => !area.onStairs(pos, 0.2);
      let e: Enemy;
      if (s.type === 'thornling') e = new Thornling(area.root, api.physics, s.x, s.z, s.y + 1, inRoom);
      else if (s.type === 'shellback') e = new Shellback(area.root, api.physics, s.x, s.z, s.y + 1, inRoom);
      else if (s.type === 'sentinel') {
        // Statues stand facing into their room.
        const r = area.def.rooms.find((room) => room.id === s.room)!;
        const facing = Math.atan2(r.x + r.w / 2 - s.x, r.z + r.d / 2 - s.z);
        e = new DozingSentinel(area.root, api.physics, s.x, s.z, s.y + 1, inRoom, facing);
      } else continue; // the boss arrives in its own milestone
      if (e instanceof GroundEnemy) e.setWalkable(walkable);
      api.addEnemy(e);
      roomEnemies.set(s.room, [...(roomEnemies.get(s.room) ?? []), e]);
    }
  };

  /** The seal: the first time in, the entrance slab rises behind Wren and its spiral goes dark. */
  const seal: Script = async (api) => {
    const p = progress(api.state);
    p.entered = true;
    const door = area.entranceDoor.group.position;
    const spawn = area.spawn;
    const toDoor = new THREE.Vector3(door.x - spawn.x, 0, door.z - spawn.z).normalize();
    // From inside the hall, past Wren's shoulder, looking back at the doorway. (Aim in front
    // of the slab, never at it: a look-at point inside a collider pulls the camera onto it.)
    const aim = door.clone().addScaledVector(toDoor, -1.2).setY(door.y + 1.6);
    api.shot(new THREE.Vector3(spawn.x - toDoor.x * 3.5 + toDoor.z * 1.5, spawn.y + 2.2, spawn.z - toDoor.z * 3.5 - toDoor.x * 1.5), aim, true);
    await api.wait(0.7);
    area.entranceDoor.setGlyph(false);
    area.entranceDoor.startClosing();
    api.sfx.rumble();
    await api.until(() => !area.entranceDoor.closing);
    await api.wait(0.6);
    await api.say([
      { text: 'Behind you, the stone slab grinds up out of the floor and shuts. The spiral on it goes dark.' },
      { text: 'Far below, something huge breathes in... and out. Slow as a hillside.' },
    ]);
    api.releaseCamera();
  };

  return {
    scripts,

    restore(state) {
      const p = progress(state);
      for (const id of p.doors) area.doors.get(id)?.setOpen();
      for (const id of p.switches) {
        area.switches.get(id)?.setPressed(true);
        area.latched.add(id);
      }
      for (const t of def.things) {
        if (t.kind !== 'chest') continue;
        const chest = area.chests.get(t.id)!;
        if (met(t.appears, p)) chest.setPresent(true);
        if (p.chests.has(t.id)) chest.open(true);
      }
      // Switch doors stay open once their switch is pressed (even if the save missed the door).
      for (const d of def.doors) {
        const needs = lockSwitches(d.lock);
        if (needs.length && needs.every((s) => p.switches.has(s))) area.doors.get(d.id)?.setOpen();
      }
      // The entrance: open on the way in, sealed while the keeper lives, open for good after.
      if (p.done) {
        area.entranceDoor.setOpen();
        area.entranceDoor.setGlyph(true);
      } else if (p.entered) area.entranceDoor.close();
      else area.entranceDoor.setOpen();
    },

    start(api) {
      if (started) return;
      started = true;
      const p = progress(api.state);
      let heavyHinted = false;
      area.onStone = (_id, result, from) => {
        if (result === 'bounced') {
          // Struck against a wall: it bounces back and shoves Wren out of its way (no harm done).
          api.sfx.stoneThunk();
          api.sfx.stoneSlide();
          api.player.push(from, 15);
        } else if (result === 'moved') api.sfx.stoneSlide();
        else if (result === 'bridged') api.sfx.columnSwing();
        else if (result === 'heavy' && !heavyHinted) {
          // The first heavy stone a blade meets: say why it won't budge.
          heavyHinted = true;
          api.sfx.stoneThunk();
          api.toast(api.state.items.has('tether') ? 'Too heavy for a blade. Try the [item] Tether Glove.' : 'Too heavy to wake with a blade.');
        }
        else if (result === 'sunk') {
          api.sfx.stoneSlide();
          api.sfx.stoneSink();
        } else api.sfx.stoneThunk();
      };
      const holdPlates = new Set(def.things.filter((t) => t.kind === 'switch' && t.hold).map((t) => t.id));
      area.onSwitch = (id) => api.run(async (a) => {
        const prog = progress(a.state);
        if (holdPlates.has(id)) {
          // A hold plate counts only with its partners down at the same moment: then the
          // whole group latches (saved, and the plates stay down).
          const groups = [
            ...def.doors.map((d) => lockSwitches(d.lock)),
            ...def.things.flatMap((t) => (t.kind === 'chest' && t.appears && 'switches' in t.appears ? [t.appears.switches] : [])),
          ].filter((g) => g.includes(id));
          const done = groups.filter((g) => g.every((s) => prog.switches.has(s) || area.switches.get(s)?.pressed));
          if (!done.length) {
            a.sfx.select(); // a click: one down, more to go
            return;
          }
          for (const g of done) for (const s of g) {
            prog.switches.add(s);
            area.latched.add(s);
          }
        } else prog.switches.add(id);
        a.sfx.solved();
        // Doors waiting on this switch open once all of their switches are pressed.
        for (const d of def.doors) {
          const needs = lockSwitches(d.lock);
          if (!needs.includes(id) || !needs.every((s) => prog.switches.has(s)) || prog.doors.has(d.id)) continue;
          prog.doors.add(d.id);
          area.doors.get(d.id)?.startOpening();
          a.sfx.rumble();
        }
        revealChests(a);
        await a.wait(0.6);
      });
      spawnAll(api);
      if (!p.entered) api.run(seal);
    },

    update(api) {
      const p = progress(api.state);
      const pos = api.player.pos;
      const floorTop = floorY(def, area.floorAt(pos.y));
      // Remember solid ground; fall into a pit and come back to it, a heart lighter.
      if (api.player.grounded && Math.abs(pos.y - floorTop) < 0.3 && area.roomAt(pos) && !area.nearPit(pos, 0.8)) {
        lastSafe.copy(pos);
        haveSafe = true;
      } else if (!falling && api.player.grounded && haveSafe && area.inPit(pos)) {
        falling = true;
        api.run(async (a) => {
          a.sfx.hurt();
          a.state.damage(2);
          await a.fade(1, 0.25);
          a.player.teleport(lastSafe.x, lastSafe.y + 0.05, lastSafe.z);
          a.player.invuln = 1;
          await a.fade(0, 0.3);
          falling = false;
        });
      }
      // Stones stay where they're put when Wren leaves a room (so a stone can be pulled
      // from out in the doorway); puzzle rooms reset when Wren falls (see onRespawn).
      lastRoom = area.roomAt(pos)?.id ?? lastRoom;
      // Step well inside a fight room with its enemies still up: the shutters drop.
      const here = area.roomAt(api.player.pos, 1.2);
      if (!fighting && here?.fight && !p.cleared.has(here.id) && alive(here.id)) {
        fighting = here.id;
        for (const s of shuttersOf(here.id)) s.startClosing();
        api.sfx.rumble();
      }
      // Any room whose enemies are all beaten counts as cleared: shutters up, chests appear.
      for (const [room] of roomEnemies) {
        if (p.cleared.has(room) || alive(room)) continue;
        p.cleared.add(room);
        if (fighting === room) {
          fighting = null;
          for (const s of shuttersOf(room)) s.startOpening();
        }
        if (rooms.get(room)?.fight || def.things.some((t) => t.kind === 'chest' && t.appears && 'cleared' in t.appears && t.appears.cleared === room)) {
          api.run(async (a) => {
            a.sfx.solved();
            revealChests(a);
            await a.wait(0.4);
          });
        }
      }
    },

    onRespawn(api) {
      // Died: the shutters lift, and every enemy is back in its room.
      if (fighting) for (const s of shuttersOf(fighting)) s.setOpen();
      fighting = null;
      spawnAll(api);
      // A puzzle (a room with a plate) gone wrong comes back with the enemies: stones on a
      // pressed plate or in a pit stay. Elsewhere a moved stone stays moved.
      for (const r of plateRooms) area.resetRoom(r);
    },
  };
}
