import * as THREE from 'three';
import { easeInOut } from '../core/math';
import { HollowLamplighter } from '../game/bosses/lamplighter';
import type { Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import { glow } from '../render/shapes';
import type { Overworld } from '../world/overworld';
import { signArrow, SIGNS } from '../world/overworld/landmarks';
import { HOLLOW, HOLLOW_ENTRANCE, VILLAGE } from '../world/overworld/layout';
import { bellContent } from './bells';
import { northpassContent } from './northpass';
import { gorgeContent } from './gorge';
import { hintContent } from './hints';
import { sigilContent } from './sigils';
import { villageContent } from './village';

/** What a loaded area needs from content: scripts by interactable/trigger id, and save restore. */
export interface AreaContent {
  scripts: Record<string, Script>;
  /** Puts the area in the state the save says (opened chests, opened doors...). */
  restore(state: GameState): void;
  /** Called when play begins in the area: spawn bosses, arm encounters. */
  start?(api: ScriptApi): void;
  /** Called after Wren respawns here (died): reset what a death should reset. */
  onRespawn?(api: ScriptApi): void;
  /** Called every frame of play (not during cutscenes): watch for things like fight rooms. */
  update?(api: ScriptApi, dt: number): void;
}

const say = (text: string, who?: string): Script => (api) => api.say([{ who, text }]);

/**
 * The crossroads sign by the spawn: one arrow, home, as seen standing in front of it (owner's call,
 * 2026-11-03: the game opens without words, and compass names were confusing).
 */
function crossroads() {
  const sign = SIGNS.find((s) => s.id === 'sign.crossroads')!;
  return `${signArrow(sign, VILLAGE)} Thistledown Village`;
}

/**
 * A point just in front of the shrine door's face (it faces west). Camera shots aim here,
 * not at the door's center: a look-at point inside the door's collider makes the camera's
 * keep-out-of-walls ray start inside stone, which pulls the camera right up against it.
 */
function doorFace(ow: Overworld, dy = 0) {
  return new THREE.Vector3(ow.door.x - 0.8, ow.door.mesh.position.y + dy, ow.door.z);
}

/** The shrine door cutscene: the camera cuts to the door and watches it sink. */
async function shrineDoorOpens(api: ScriptApi, ow: Overworld) {
  await api.say([{ text: 'You press your hand to the glowing spiral. The stone groans, and the door begins to sink into the earth.' }]);
  const at = doorFace(ow, -0.5);
  api.shot(new THREE.Vector3(ow.door.x - 11, at.y + 3, ow.door.z + 7), at);
  await api.wait(0.9);
  ow.door.startOpening();
  api.state.set('shrineOpen');
  api.sfx.rumble();
  await api.until(() => ow.door.open);
  api.sfx.solved();
  await api.wait(1.2);
  api.releaseCamera();
}

/** A point along a quadratic Bézier curve (for things flying in arcs). */
function arc(a: THREE.Vector3, mid: THREE.Vector3, b: THREE.Vector3, t: number) {
  const u = 1 - t;
  return a.clone().multiplyScalar(u * u).addScaledVector(mid, 2 * u * t).addScaledVector(b, t * t);
}

export function overworldContent(ow: Overworld): AreaContent {
  let lamplighter: HollowLamplighter | null = null;
  const gorge = gorgeContent(ow);
  const northpass = northpassContent(ow);
  const hints = hintContent(ow.buds);
  const village = villageContent(ow);
  const bells = bellContent({ 'bellPost.morrow': ow.morrowPost, 'bellPost.way': ow.wayPost }, { 'bellPickup.morrow': ow.morrowBell, 'bellPickup.way': ow.wayBell }, { 'bellPickup.morrowLost': ow.morrowLost });

  /** Waking the Lamplighter: the ring of cold fire seals the hollow, and it turns around. */
  const lamplighterWakes: Script = async (api) => {
    const boss = lamplighter;
    if (!boss) return;
    api.silenceMusic(true); // the field's song stops dead as the trap springs
    ow.hollow.armed = false;
    ow.hollow.seal();
    api.sfx.flameRing();
    const p = api.player.pos.clone();
    const head = boss.headWorldPos();
    const toBoss = head.clone().sub(p).setY(0).normalize();
    const side = new THREE.Vector3(-toBoss.z, 0, toBoss.x);
    // Low, over the shoulder: the hunched thing in the middle of the hollow, back turned.
    api.shot(p.clone().addScaledVector(toBoss, -3).addScaledVector(side, 1.2).setY(p.y + 1.4), head.clone().setY(head.y - 1), true);
    await api.wait(1.5);
    boss.wake();
    // Low and close, looking up at it as its head turns all the way around to face you.
    api.shot(boss.pos.clone().addScaledVector(toBoss, -6).addScaledVector(side, 2.5).setY(boss.pos.y + 0.8), head.clone().setY(head.y - 0.4));
    await api.until(() => boss.ready);
    api.showBossTitle(boss.title, boss.epithet);
    await api.wait(1.8);
    boss.engage();
    api.silenceMusic(false); // and the fight's song starts with the fight
  };

  /** Its death: slow motion, the cage bursts, and the freed flame flies home to the shrine. */
  const lamplighterFalls: Script = async (api) => {
    const boss = lamplighter;
    if (!boss) return;
    api.state.set('lamplighterDefeated');
    const toPlayer = api.player.pos.clone().sub(boss.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    api.setTimeScale(0.25);
    // From the side, so the player isn't in the way.
    api.shot(boss.pos.clone().addScaledVector(side, 7.5).addScaledVector(toPlayer, 1.5).setY(boss.pos.y + 2.2), boss.headWorldPos().setY(boss.pos.y + 2.4), true);
    await api.wait(0.45);
    api.setTimeScale(1);
    await api.until(() => boss.shattered);

    const spark = new THREE.Group();
    spark.add(glow(0xffb35a, 0.7, 0.45), glow(0xfff1c0, 0.25, 0.9));
    const start = boss.headWorldPos();
    spark.position.copy(start);
    ow.root.add(spark);
    await api.wait(1.2);
    const up = start.clone().setY(start.y + 5);
    await api.tween(1.6, (t) => {
      spark.position.lerpVectors(start, up, easeInOut(t));
      api.particles.burst(spark.position, 0xffb35a, 1, 1, 0.5, false);
    });
    ow.hollow.clear();

    // It streaks away northeast; the camera watches it go, then cuts to the shrine as it lands.
    const lantern = ow.lantern.mesh.position.clone();
    const mid = up.clone().lerp(lantern, 0.5).setY(Math.max(up.y, lantern.y) + 30);
    const from = boss.pos.clone().addScaledVector(lantern.clone().sub(boss.pos).setY(0).normalize(), -6).setY(boss.pos.y + 1.5);
    await api.tween(2.4, (t) => {
      spark.position.copy(arc(up, mid, lantern, easeInOut(t) * 0.45));
      api.shot(from, spark.position);
      api.particles.burst(spark.position, 0xffb35a, 2, 1.5, 0.6, false);
    });
    // Through the gap in the shrine's ring of pillars, looking up at the roof.
    api.shot(new THREE.Vector3(lantern.x - 16, lantern.y - 5, lantern.z + 2), lantern, true);
    await api.tween(1.8, (t) => {
      spark.position.copy(arc(up, mid, lantern, 0.45 + easeInOut(t) * 0.55));
      api.particles.burst(spark.position, 0xffb35a, 2, 1.5, 0.6, false);
    });
    spark.removeFromParent();
    spark.traverse((m) => m instanceof THREE.Mesh && (m.geometry.dispose(), (m.material as THREE.Material).dispose()));
    ow.lantern.setEmbers(1);
    api.sfx.solved();
    await api.wait(1.6);
    // Down to the door below: its spiral wakes in the lantern's light. A fade covers the cut (a glide
    // from the roof would sweep through the pillars), then the camera eases back and up from the
    // spiral until the lit roof comes into view above the door.
    const spiral = doorFace(ow, 0.4);
    const x = ow.door.x, z = ow.door.z;
    await api.fade(1, 0.4);
    api.shot(new THREE.Vector3(x - 11, spiral.y - 0.4, z + 2.5), spiral, true);
    await api.fade(0, 0.5);
    ow.door.wake();
    await api.tween(3.4, (t) => {
      const e = easeInOut(t);
      api.shot(
        new THREE.Vector3(x - 11 - e * 4, spiral.y - 0.4 + e * 2.2, z + 2.5 - e),
        new THREE.Vector3(spiral.x, spiral.y + e * 3, spiral.z),
      );
    });
    await api.wait(0.6);
    // Back to Wren, far across the valley: fade out and put the camera behind them, not a flight over the map.
    await api.fade(1, 0.5);
    api.releaseCamera(true);
    await api.fade(0, 0.5);
    ow.vessel.show();
    // Where the Lamplighter stood, something has been written in the air.
    ow.sigil.setPresent(true);
    api.particles.burst(ow.sigil.group.position, 0xe2d6ff, 24, 2, 1.2, false);
    await api.say([{ text: 'The flame is free. Far to the northeast, the great lantern holds one warm ember again, and the spiral on the shrine door has begun to glow.' }]);
  };

  /**
   * The Lamplighter walks its rounds only at night: it rises in the hollow at dusk (so the fight
   * starts at night, with the night theme's boss version) and gutters out at dawn, unless a fight
   * is under way. Then it can't leave, and the daylight burns it to death (its dawn burn).
   */
  const watchTheHollow = (api: ScriptApi) => {
    if (api.state.has('lamplighterDefeated')) return;
    if (api.state.isNight && !lamplighter) {
      // Waits in the middle of the hollow with its back to the road.
      lamplighter = new HollowLamplighter(ow.root, api.physics, ow.hollow, HOLLOW.x, HOLLOW.z + 3, 0);
      lamplighter.onDefeated = () => api.run(lamplighterFalls);
      lamplighter.rise();
      api.addEnemy(lamplighter);
      ow.hollow.armed = true;
    } else if (!api.state.isNight && lamplighter && !lamplighter.engaged && !ow.hollow.sealed && lamplighter.alive) {
      ow.hollow.armed = false; // no waking it while it fades
      lamplighter.vanish();
      if (lamplighter.vanished) {
        api.removeEnemy(lamplighter);
        lamplighter = null;
      }
    }
  };

  const scripts: Record<string, Script> = {
    ...village.scripts,

    async 'chest.grove'(api) {
      if (api.state.keys <= 0) {
        await api.say([{ text: 'The chest is shut with an old iron padlock.\nSomeone in *Thistledown* might have the key.' }]);
        return;
      }
      api.state.keys--;
      await api.say([{ text: 'You unlocked the padlock with the *Small Key*.' }]);
      ow.chest.open();
      api.state.set('groveChestOpened');
      await api.wait(0.9);
      api.sfx.fanfare();
      api.giveSword();
      api.particles.burst(new THREE.Vector3(ow.chest.x, api.player.pos.y + 1.2, ow.chest.z), 0xfff1a8, 30, 4, 1.2, false);
      await api.say([
        { text: 'You found the *Wayfarer\'s Blade*!\nIts edge is nicked, but it still sings when you swing it.' },
        { text: '[attack] swings; press it again in rhythm for a three-hit combo. [lock] locks on to an enemy.' },
        { text: 'Maren will want to see this. Head back to *Thistledown*.' },
      ]);
    },

    async 'door.shrine'(api) {
      if (ow.door.awake) {
        await shrineDoorOpens(api, ow);
        return;
      }
      const hint = api.state.has('hasSword')
        ? 'The lantern above it is dark. Whatever took its flame went southwest, to the Gloaming Hollow.'
        : 'Maybe someone in *Thistledown* knows how to open it.';
      await api.say([{ text: `A slab of cold stone with a spiral carved into it. It won't budge.\n${hint}` }]);
    },

    async 'trigger.shrineEntrance'(api) {
      await api.travel('shrine');
    },

    ...bells.scripts,
    ...hints.scripts,
    ...sigilContent(new Map([['sigil.hollow', ow.sigil]])),
    'sign.crossroads': say(crossroads()),
    'sign.gorge': say('THE HUSHING GORGE\n"Walk soft. The stone keeps the old bell\'s hush, and what guards it does not like noise."\nBelow, in a child\'s hand: *the way up is over the gap*'),
    'sign.hollow': say('GLOAMING HOLLOW\n"Here ends the lamplighter\'s road. Lamps lit at dusk, snuffed at dawn."\nUnderneath, scratched in fresh and shaky: *TURN BACK*'),
    async 'trigger.hollow'(api) {
      if (api.state.has('hasSword')) return lamplighterWakes(api);
      // Unarmed: it doesn't wake, and Wren thinks better of it.
      await api.say([{ text: 'Something tall stands in the middle of the hollow, perfectly still, its back to you.\nYou\'d rather not go closer without a weapon.' }]);
      await api.fade(1, 0.4);
      api.player.teleport(HOLLOW_ENTRANCE.x, api.physics.groundY(HOLLOW_ENTRANCE.x, HOLLOW_ENTRANCE.z - 6) ?? api.player.pos.y, HOLLOW_ENTRANCE.z - 6, Math.PI);
      await api.fade(0, 0.4);
    },

    async 'trigger.heartVessel'(api) {
      ow.vessel.collect();
      api.state.set('hollowVessel');
      api.state.maxHp += 2;
      api.state.hp = api.state.maxHp;
      api.sfx.fanfare();
      await api.say([{ text: 'You got a *Heart Vessel*!\nYour life grew by one heart, and you feel completely restored.' }]);
    },
    'sign.village': say('Thistledown Village\n"Mind the windmill. Mind the thornlings more."'),
    'sign.canyon': say('WAYFARERS\' CAMP\n"Rest if you have a bed. Cross if you have the nerve. The Waybell went over the gap, and nobody has come back with it."'),
    'sign.gate': (api) => api.say([{ text: api.state.has('valleyOpen') ? 'The Northpass\nThe gate has fallen. Mind the road: nobody has walked it in a long while.' : 'The Northpass\nA gate of floating stone rose here the night the lantern went dark. Nobody has gone through since.' }]),
    'sign.grove': say('The Whispering Grove\nThe trees here are said to remember every word ever spoken beneath them.'),
    'sign.pedestal': say('Old letters, worn by rain:\n"While the lantern burns, the sleeping stone shall wake. Rekindle the lantern, and the night shall break."'),
  };

  return {
    scripts,
    restore(state) {
      village.restore(state);
      bells.restore(state);
      hints.restore(state);
      ow.jars.restore((id) => state.has(`jar.${id}`));
      if (state.has('groveChestOpened')) ow.chest.open(true);
      if (state.has('shrineOpen')) ow.door.setOpen();
      if (state.has('lamplighterDefeated')) {
        ow.hollow.clear();
        ow.sigil.setPresent(true);
        ow.lantern.setEmbers(1, true);
        ow.door.wake(true);
        if (!state.has('hollowVessel')) ow.vessel.show();
      }
      // Gravelheart's ember went to the lantern too: two embers. The ward on the gate is broken for good.
      if (state.dungeon('shrine').done) ow.lantern.setEmbers(2, true);
      if (state.has('valleyOpen')) ow.gate.setOpen();
    },
    start(api) {
      watchTheHollow(api);
      gorge.start(api);
    },

    onRespawn(api) {
      gorge.onRespawn(api);
      northpass.onRespawn(api);
    },

    update(api) {
      watchTheHollow(api);
      gorge.update(api);
      northpass.update(api);
    },
  };
}
