import * as THREE from 'three';
import { GroundEnemy, Thornling, type Enemy } from '../game/enemies';
import { DozingSentinel } from '../game/sentinel';
import { Shellback } from '../game/shellback';
import type { Script, ScriptApi } from '../game/script';
import { TrialFalls } from '../game/trialFalls';
import type { DungeonProgress, GameState } from '../game/state';
import type { DungeonArea } from '../world/dungeon/build';
import { floorY, keyName, lockSwitches, type Condition, type Loot, type Potion, type RoomDef } from '../world/dungeon/format';
import { bellContent } from './bells';
import type { AreaContent } from './overworld';

/**
 * The Waking Shrine's content: what its chests hold and say, what unlocks what, when a
 * room counts as cleared, and the way out (the entrance never closes).
 * Everything is driven by the dungeon's data ids and saved per dungeon
 * (`GameState.dungeon('shrine')`), so adding a chest or door to the data needs no code here.
 * See docs/shrine.md for the design and milestones.
 */

const LOOT_TEXT: Record<string, string> = {
  bossKey: 'You found the *Boss Key*!\nIts great teeth fit the door to the shrine\'s keeper.',
  tether: 'You got the *Tether Glove*!\nA glowing cord coils around the old leather and tugs toward the shrine\'s stones, as if it knows them.',
};

/** A flask chest's message; `slot` is the flask's button (flask1, flask2). */
const flaskText = (potion: Potion, slot: number) => {
  const key = `[flask${slot + 1}]`;
  return potion === 'life'
    ? `You found a flask of *Life Potion*!\n${key} drinks it, and every heart comes back. Then the flask stays empty, until Odo in Thistledown fills it for a few gems.`
    : `You found a flask of *Attack Potion*!\n${key} drinks it, and your sword strikes twice as hard for 30 seconds. Odo in Thistledown refills empty flasks.`;
};

export function shrineContent(area: DungeonArea): AreaContent {
  const def = area.def;
  /** Enemies by the room they belong to (a room is cleared when all of theirs are beaten). */
  const roomEnemies = new Map<string, Enemy[]>();
  /** The room Wren was last in (leaving a room resets its stones). */
  let lastRoom: string | null = null;
  /** The last solid floor Wren stood on, where a fall into a pit puts them back. */
  const lastSafe = new THREE.Vector3();
  let haveSafe = false;
  let falling = false;
  /** In a bell trial room: falls return to the last checkpoint ledge instead of costing hearts. */
  let trial: TrialFalls | null = null;
  let trialRoom: string | null = null;
  let started = false;
  /** The fall rule for a trial room: its checkpoint platforms, and everything below its floor is a fall. */
  const trialFor = (r: RoomDef, start: THREE.Vector3) => {
    const fy = floorY(def, r.floor);
    const cps = (r.platforms ?? []).filter((p) => p.checkpoint && !p.move)
      .map((p) => ({ x: r.x + p.x, z: r.z + p.z, hw: p.w / 2, hd: p.d / 2, top: fy + p.top }));
    return new TrialFalls(cps, fy - 1, start);
  };
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

  /** Rooms whose chest appears once they're cleared: beating them is permanent. */
  const challengeRooms = new Set(
    def.things.flatMap((t) => (t.kind === 'chest' && t.appears && 'cleared' in t.appears ? [t.appears.cleared] : [])),
  );
  const alive = (room: string) => (roomEnemies.get(room) ?? []).some((e) => e.alive);

  const lootMessage = (api: ScriptApi, loot: Loot) => {
    if (typeof loot === 'string') return LOOT_TEXT[loot];
    if ('key' in loot) return `You found the *${keyName(loot.key)}*!\nIt opens one locked door in this shrine: the ${loot.key} one.`;
    if ('item' in loot) return LOOT_TEXT[loot.item] ?? `You got the *${loot.item}*!`;
    if ('flask' in loot) return flaskText(loot.flask, api.state.flasks.slots.length - 1);
    return `You found ${loot.gems} gems!`;
  };

  const bells = bellContent(Object.fromEntries(area.bellPostsById), Object.fromEntries(area.bellPickups));
  const scripts: Record<string, Script> = {
    // Leaving: the entrance is always open.
    async exit(api) {
      await api.travel('overworld', 'shrineDoor');
    },
    ...bells.scripts,
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
      if (loot === 'bossKey') p.bossKey = true;
      else if ('key' in loot) p.keys.add(loot.key);
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
      } else if ('flask' in loot) api.state.flasks.add(loot.flask);
      else api.state.addGems(loot.gems);
      await api.say([{ text: lootMessage(api, loot) }]);
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
      if (door.style === 'key') {
        const color = door.keyColor!;
        if (!p.keys.has(color)) return api.say([{ text: `Locked. It needs the *${keyName(color)}*.` }]);
        p.keys.delete(color);
      } else if (door.style === 'boss') {
        if (!p.bossKey) return api.say([{ text: 'A heavy door with a great iron lock.\nIt needs the shrine\'s *Boss Key*.' }]);
      } else {
        return api.say([{ text: 'Iron bars. Something in this shrine must raise them.' }]);
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
   * enemies). Beaten challenge rooms stay empty.
   */
  const spawnAll = (api: ScriptApi) => {
    for (const list of roomEnemies.values()) for (const e of list) api.removeEnemy(e);
    roomEnemies.clear();
    const p = progress(api.state);
    for (const s of area.spawns) {
      // A beaten challenge room (one a chest waits on) stays empty; other rooms refill.
      if (p.cleared.has(s.room) && challengeRooms.has(s.room)) continue;
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

  return {
    scripts,

    restore(state) {
      bells.restore(state);
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
        // Keys are derived from what the save says happened (this also covers v3 saves, which kept a count):
        // an opened key chest whose door hasn't been unlocked means that key is still held.
        const loot = t.loot;
        if (p.chests.has(t.id) && typeof loot === 'object' && 'key' in loot) {
          const door = def.doors.find((d) => d.lock && typeof d.lock === 'object' && 'key' in d.lock && d.lock.key === loot.key);
          if (door && !p.doors.has(door.id)) p.keys.add(loot.key);
        }
      }
      // Switch doors stay open once their switch is pressed (even if the save missed the door).
      for (const d of def.doors) {
        const needs = lockSwitches(d.lock);
        if (needs.length && needs.every((s) => p.switches.has(s))) area.doors.get(d.id)?.setOpen();
      }
    },

    start(api) {
      if (started) return;
      started = true;
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
          api.toast(api.state.items.has('tether') ? 'Too heavy for a blade. Try the [item] Tether Glove.' : 'Too heavy for a blade.');
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
    },

    update(api) {
      const p = progress(api.state);
      const pos = api.player.pos;
      const floorTop = floorY(def, area.floorAt(pos.y));
      // Remember solid ground; fall into a pit and come back to it, a heart lighter.
      const onSafe = api.player.grounded && Math.abs(pos.y - floorTop) < 0.3 && area.roomAt(pos) && !area.nearPit(pos, 0.8);
      if (onSafe) {
        lastSafe.copy(pos);
        haveSafe = true;
      }
      // Bell trial rooms use the trial rule: back on the last checkpoint ledge, free of damage.
      const tr = area.trialRoomAt(pos);
      if ((tr?.id ?? null) !== trialRoom) {
        trialRoom = tr?.id ?? null;
        trial = tr ? trialFor(tr, haveSafe ? lastSafe : pos) : null;
      }
      if (trial) {
        if (onSafe) trial.checkpoint.copy(pos);
        if (trial.check(pos, api.player.grounded, area.inPit(pos))) {
          const t = trial;
          api.run((a) => t.recover(a));
        }
      } else if (!falling && !onSafe && api.player.grounded && haveSafe && area.inPit(pos)) {
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
      // Any room whose enemies are all beaten counts as cleared: its chests appear.
      for (const [room] of roomEnemies) {
        if (p.cleared.has(room) || alive(room)) continue;
        p.cleared.add(room);
        if (def.things.some((t) => t.kind === 'chest' && t.appears && 'cleared' in t.appears && t.appears.cleared === room)) {
          api.run(async (a) => {
            a.sfx.solved();
            revealChests(a);
            await a.wait(0.4);
          });
        }
      }
    },

    onRespawn(api) {
      // Died: every enemy is back in its room.
      spawnAll(api);
      // A puzzle (a room with a plate) gone wrong comes back with the enemies: stones on a
      // pressed plate or in a pit stay. Elsewhere a moved stone stays moved.
      for (const r of plateRooms) area.resetRoom(r);
    },
  };
}
