import * as THREE from 'three';
import { Gravelheart } from '../game/bosses/gravelheart';
import type { Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import type { DungeonArea } from '../world/dungeon/build';

/**
 * Gravelheart's encounter in Warden's Hearth: it sleeps in a heap facing the boss door;
 * walking in shuts the door behind Wren and wakes it. Beating it opens the hearth for good
 * (`DungeonProgress.done`). Dying mid-fight resets it and reopens the door (`Boss.reset`).
 * Part of the shrine's content (`shrineContent` folds it in). See docs/shrine.md, "The boss".
 */
export function wardenContent(area: DungeonArea) {
  const hearth = area.hearth;
  const spawn = area.spawns.find((s) => s.type === 'gravelheart');
  let boss: Gravelheart | null = null;
  const done = (s: GameState) => s.dungeon(area.def.id).done;

  /** Walking in: the door grinds shut behind Wren, and the heap in the middle of the hall wakes. */
  const wakes: Script = async (api) => {
    const b = boss;
    if (!b || !hearth) return;
    api.silenceMusic(true);
    hearth.seal();
    api.sfx.rumble();
    const p = api.player.pos.clone();
    const toBoss = b.pos.clone().sub(p).setY(0).normalize();
    const side = new THREE.Vector3(-toBoss.z, 0, toBoss.x);
    // Looking back past Wren as the door rises out of the floor.
    api.shot(p.clone().addScaledVector(toBoss, 4.5).addScaledVector(side, 1.5).setY(p.y + 2.2), p.clone().addScaledVector(toBoss, -2.5).setY(p.y + 1.6), true);
    await api.wait(1.6);
    // Over the shoulder: a great heap of carved stone, an ember breathing inside it.
    api.shot(p.clone().addScaledVector(toBoss, -2.5).addScaledVector(side, 1.4).setY(p.y + 1.8), b.pos.clone().setY(b.pos.y + 1.6), true);
    await api.wait(1.2);
    b.wake();
    // Low in front of it, looking up as it heaves itself up and opens its eyes.
    api.shot(b.pos.clone().addScaledVector(b.forward, 7.5).addScaledVector(side, 2.5).setY(b.pos.y + 1.0), b.headWorldPos().setY(b.pos.y + 3.6));
    await api.until(() => b.ready);
    api.showBossTitle(b.title, b.epithet);
    await api.wait(1.8);
    b.engage();
    api.silenceMusic(false);
  };

  /**
   * Beaten: it sinks to its knees and sleeps at last; the door opens.
   * (Placeholder until session D: the ember's flight to the lantern and the Heart Vessel.)
   */
  const falls: Script = async (api) => {
    const b = boss;
    if (!b) return;
    api.state.dungeon(area.def.id).done = true;
    const toPlayer = api.player.pos.clone().sub(b.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    api.setTimeScale(0.3);
    api.shot(b.pos.clone().addScaledVector(side, 9).addScaledVector(toPlayer, 2).setY(b.pos.y + 2.4), b.pos.clone().setY(b.pos.y + 2.4), true);
    await api.wait(0.5);
    api.setTimeScale(1);
    await api.until(() => b.asleep);
    await api.wait(1);
    hearth?.clear();
    api.sfx.solved();
    await api.wait(1.2);
  };

  return {
    scripts: { 'trigger.warden': wakes } as Record<string, Script>,

    restore(state: GameState) {
      if (done(state)) hearth?.clear(true);
    },

    start(api: ScriptApi) {
      if (!hearth || !spawn || done(api.state) || boss) return;
      // Asleep in the middle of the hall, facing the door Wren comes in by.
      const door = hearth.center.clone();
      const d = area.def.doors.find((x) => x.lock === 'boss');
      const dd = d ? area.doors.get(d.id) : undefined;
      if (dd) door.copy(dd.group.position);
      const yaw = Math.atan2(door.x - spawn.x, door.z - spawn.z);
      boss = new Gravelheart(area.root, api.physics, hearth, spawn.x, spawn.y, spawn.z, yaw);
      boss.onDefeated = () => api.run(falls);
      api.addEnemy(boss);
      hearth.armed = true;
    },
  };
}
