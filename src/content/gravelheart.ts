import * as THREE from 'three';
import { easeInOut } from '../core/math';
import { Gravelheart } from '../game/bosses/gravelheart';
import type { Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import { liftVillageBell } from './bells';
import { glow } from '../render/shapes';
import type { DungeonArea } from '../world/dungeon/build';
import type { Overworld } from '../world/overworld';

/**
 * Gravelheart's encounter in Warden's Hearth: it sleeps in a heap facing the boss door;
 * walking in shuts the door behind Wren and wakes it. Beating it opens the hearth for good
 * (`DungeonProgress.done`), leaves a Heart Vessel and a way to the Keepers' Seal. Dying mid-fight resets it and reopens the door (`Boss.reset`).
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
    // Looking back at Wren as the door rises behind her. The camera stays on the doorway's own axis, well
    // ahead of her: the walls beside the entry hold a camera on a diagonal right in her face.
    const doorAt = area.doors.get('bossDoor')?.group.position;
    const inward = doorAt ? p.clone().sub(doorAt).setY(0).normalize() : toBoss.clone();
    api.shot(p.clone().addScaledVector(inward, 6.5).setY(p.y + 2.5), p.clone().addScaledVector(inward, -0.8).setY(p.y + 1.5), true);
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

  /** The hidden door that waits for the Hearth to be cleared, and the room behind it. */
  const sealDef = hearth ? area.def.doors.find((d) => d.from === hearth.room.id && d.lock && typeof d.lock === 'object' && 'cleared' in d.lock && d.lock.cleared === hearth.room.id) : undefined;

  /**
   * Beaten: it sinks to its knees and sleeps at last. Its ember rises out of the stone toward the
   * lantern, the door opens, a Heart Vessel appears, and stones rise out of the north pit into a
   * causeway to a hidden door (the Keepers' Seal, see `seal` below).
   */
  const falls: Script = async (api) => {
    const b = boss;
    if (!b || !hearth) return;
    const prog = api.state.dungeon(area.def.id);
    prog.done = true;
    prog.cleared.add(hearth.room.id);
    liftVillageBell(api.state); // the valley is free: the village's bell is taken off its post, so Wren walks home
    const toPlayer = api.player.pos.clone().sub(b.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    api.setTimeScale(0.3);
    api.shot(b.pos.clone().addScaledVector(side, 9).addScaledVector(toPlayer, 2).setY(b.pos.y + 2.4), b.pos.clone().setY(b.pos.y + 2.4), true);
    await api.wait(0.5);
    api.setTimeScale(1);
    await api.until(() => b.asleep);
    await api.wait(1);

    // Its ember drifts out of the chest and up through the roof, toward the lantern on the hill.
    const spark = new THREE.Group();
    spark.add(glow(0xffb35a, 0.5, 0.45), glow(0xfff1c0, 0.18, 0.9));
    const start = b.pos.clone().setY(b.pos.y + 3);
    spark.position.copy(start);
    area.root.add(spark);
    api.sfx.solved();
    const top = start.clone().setY(hearth.center.y + 11);
    api.shot(start.clone().addScaledVector(side, 14).setY(start.y + 1), start, true);
    await api.tween(3.2, (t) => {
      spark.position.lerpVectors(start, top, easeInOut(t));
      api.particles.burst(spark.position, 0xffb35a, 1, 1, 0.5, false);
      api.shot(start.clone().addScaledVector(side, 14).setY(start.y + 1), spark.position);
    });
    spark.removeFromParent();
    spark.traverse((m) => m instanceof THREE.Mesh && (m.geometry.dispose(), (m.material as THREE.Material).dispose()));
    await api.wait(0.6);
    api.releaseCamera();
    hearth.clear();
    if (!api.state.has('gravelheartVessel')) hearth.vessel.show();
    await api.say([{ text: 'Gravelheart kneels, and the stone goes quiet. Its ember rises through the roof, toward the lantern on the eastern hill.\nThe ring sinks and the great door opens.' }]);

    // The north wall: stones climb out of the pit, and a door that was never there grinds open.
    const door = hearth.sealDoor;
    if (door) {
      api.shot(new THREE.Vector3(door.x - 6, door.y + 6.5, door.z + 16), new THREE.Vector3(door.x, door.y + 1.2, door.z + 1), true);
      await api.wait(0.8);
      api.sfx.rumble();
      hearth.raiseCauseway();
      await api.until(() => hearth.causewayUp);
      await api.wait(0.5);
      if (sealDef) {
        prog.doors.add(sealDef.id);
        area.doors.get(sealDef.id)?.startOpening();
        api.sfx.rumble();
      }
      await api.wait(2.2);
      api.releaseCamera();
      api.toast('Something has opened in the north wall.');
    }
  };

  /**
   * The prism (the `sealStone` switch, shattered by four sword hits): the view cuts to the magic gate as its stones fall and the veil comes apart, then
   * back to the room. `valleyOpen` is set as the ward breaks (the overworld restores the gate open).
   */
  const seal: Script = async (api) => {
    const prog = api.state.dungeon(area.def.id);
    await api.wait(1.4); // the shards fall and the beams go dark
    api.sfx.solved();
    await api.say([{ text: 'The prism is gone, and its light runs out through the walls. The room falls away, and you see a gate of floating stones, far to the northwest.' }]);
    // The shot is set as the valley loads, before the screen fades in: it is a vision, and Wren isn't standing there.
    await api.travel('overworld', 'gateView', true, () => {
      const gc = (api.area as unknown as Overworld).gate.center;
      api.hidePlayer(true);
      api.shot(new THREE.Vector3(gc.x - 13, gc.y + 0.5, gc.z + 17), gc, true);
    });
    const ow = api.area as unknown as Overworld;
    const gc = ow.gate.center;
    await api.wait(1.8);
    ow.gate.open();
    api.sfx.rumble();
    api.state.set('valleyOpen');
    prog.switches.add('sealStone');
    api.shot(new THREE.Vector3(gc.x - 9, gc.y - 0.5, gc.z + 13), gc);
    await api.until(() => ow.gate.settled);
    api.sfx.solved();
    await api.wait(1.8);
    // Back in the room, but beyond the prism, facing the message that has just appeared.
    await api.travel('shrine', 'sealStone.beyond', true);
    api.hidePlayer(false);
    api.releaseCamera();
    api.toast('The ward is broken. The gate has fallen, and the way north is open.');
  };

  /** The Heart Vessel the Warden leaves behind. */
  const vessel: Script = async (api) => {
    hearth?.vessel.collect();
    api.state.set('gravelheartVessel');
    api.state.maxHp += 2;
    api.state.hp = api.state.maxHp;
    api.sfx.fanfare();
    await api.say([{ text: 'You got a *Heart Vessel*!\nYour life grew by one heart, and you feel completely restored.' }]);
  };

  return {
    scripts: { 'trigger.warden': wakes, 'trigger.heartVessel': vessel } as Record<string, Script>,
    /** The seal-stone's id in the dungeon data; striking it plays `seal`. */
    sealStone: 'sealStone',
    seal,

    restore(state: GameState) {
      if (!done(state)) return;
      hearth?.clear(true);
      if (!state.has('gravelheartVessel')) hearth?.vessel.show();
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
