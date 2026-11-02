import * as THREE from 'three';
import { easeInOut } from '../core/math';
import { HollowLamplighter } from '../game/bosses/lamplighter';
import type { Script, ScriptApi } from '../game/script';
import { notesMarkup } from '../game/songs';
import type { GameState } from '../game/state';
import { glow } from '../render/shapes';
import type { Overworld } from '../world/overworld';
import { HOLLOW } from '../world/overworld/layout';

/** What a loaded area needs from content: scripts by interactable/trigger id, and save restore. */
export interface AreaContent {
  scripts: Record<string, Script>;
  /** Puts the area in the state the save says (opened chests, opened doors...). */
  restore(state: GameState): void;
  /** Called when play begins in the area: spawn bosses, arm encounters. */
  start?(api: ScriptApi): void;
}

const say = (text: string, who?: string): Script => (api) => api.say([{ who, text }]);

/** The shrine door cutscene: the camera cuts to the door and watches it sink. */
export async function shrineDoorOpens(api: ScriptApi, ow: Overworld) {
  await api.say([{ text: 'The spiral flares bright. With a deep grinding groan, the stone door begins to sink into the earth...' }]);
  const y = ow.door.mesh.position.y;
  api.shot(new THREE.Vector3(ow.door.x - 11, y + 2.5, ow.door.z + 7), new THREE.Vector3(ow.door.x, y - 0.5, ow.door.z));
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

  /** Waking the Lamplighter: the ring of cold fire seals the hollow, and it turns around. */
  const lamplighterWakes: Script = async (api) => {
    const boss = lamplighter;
    if (!boss) return;
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

    // It streaks away east; the camera watches it go, then cuts to the shrine as it lands.
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
    await api.wait(2.2);
    api.releaseCamera();
    ow.vessel.show();
    await api.say([{ text: 'The stolen flame is free. Far to the east, the great lantern holds a single warm ember again.' }]);
  };

  const scripts: Record<string, Script> = {
    async 'npc.maren'(api) {
      const { state } = api;
      const who = 'Maren';
      if (!state.has('metMaren')) {
        await api.say([
          { who, text: 'Wren! You\'re up at last. Did you see it? The lantern on the Waking Shrine went dark last night.' },
          { who, text: 'That light has burned on the eastern hill since before my grandmother\'s grandmother. Now the thornlings are crawling all over Emberfield.' },
          { who, text: 'The shrine door only opens to a song. My grandmother hummed it to me when I was small. Here, listen closely...' },
        ]);
        state.set('metMaren');
        state.songs.add('waking');
        api.sfx.solved();
        await api.say([
          { text: `You learned the *Song of Waking*!\n${notesMarkup('waking')}\nPress [flute] to take out your flute, then play the notes.` },
          { who, text: 'You can\'t go up there empty-handed. An old blade sleeps in a chest in the Whispering Grove, to the northeast. Take it first.' },
        ]);
      } else if (!state.has('hasSword')) {
        await api.say([{ who, text: 'The Whispering Grove is northeast of the field. Follow the road past the big lone oak. The chest sits in a clearing where the light falls.' }]);
      } else if (!ow.door.open) {
        await api.say([{ who, text: `You found the blade! Now go east to the shrine and play the Song of Waking at the door.\n${notesMarkup('waking')}` }]);
      } else {
        await api.say([{ who, text: 'You opened it?! Then the old stories are true... Whatever is down there, Wren, come back in one piece.' }]);
      }
      if (state.has('hasSword') && !state.has('lamplighterDefeated')) {
        await api.say([
          { who, text: 'And Wren... stay out of the Gloaming Hollow, south past the bridge. Old Corwin lit the lamps down there for forty years.' },
          { who, text: 'Since the lantern went dark, people say they\'ve seen him still walking his rounds. Only... taller than he was.' },
        ]);
      } else if (state.has('lamplighterDefeated')) {
        await api.say([{ who, text: 'Did you see the shrine? The lantern is glowing again, just a little. Something came home last night... was that you?' }]);
      }
    },

    async 'npc.tobin'(api) {
      const lines = api.state.isNight
        ? ['Can\'t sleep either? The wisps come out after dark. Little purple things. One good whack pops them.',
          'If the night drags on, play the Song of Hours on that flute of yours. Never could carry a tune myself.']
        : ['The mill doesn\'t need wind, you know. It turns because it\'s always turned. Don\'t ask me how.',
          'Cut the bushes around the fence if you need gems. They grow back. Everything here grows back. Except my hair.'];
      if (api.state.has('lamplighterDefeated')) lines.push('Saw a light streak across the sky, east toward the shrine. Either that\'s good news or I need more sleep.');
      await api.say(lines.map((text) => ({ who: 'Tobin the Miller', text })));
    },

    async 'chest.grove'(api) {
      ow.chest.open();
      api.state.set('groveChestOpened');
      await api.wait(0.9);
      api.sfx.fanfare();
      api.giveSword();
      api.particles.burst(new THREE.Vector3(ow.chest.x, api.player.pos.y + 1.2, ow.chest.z), 0xfff1a8, 30, 4, 1.2, false);
      await api.say([
        { text: 'You found the *Wayfarer\'s Blade*!\nIts edge is nicked, but it still sings when you swing it.' },
        { text: 'Press [attack] to swing. Keep pressing in rhythm for a three-hit combo. Press [lock] to lock on to an enemy.' },
        { text: 'Hold [shield] to raise your shield (you can still jump with it up). Each block knocks down some of its *guard*, the green bars beside you.' },
        { text: 'Guard only comes back while your shield is *lowered*, so back off and let it recover. Block with too little guard left and it *breaks*: no shield for a couple of seconds.' },
      ]);
    },

    'door.shrine': say('A sealed slab of stone with a glowing spiral carved into it. It hums faintly, as if waiting for a sound.'),

    async 'trigger.shrineEntrance'(api) {
      await api.card('The Waking Shrine', 'Stone steps spiral down into the dark.\nThe first dungeon is still being carved... to be continued.');
      api.player.teleport(ow.door.x - 3, api.player.pos.y, ow.door.z, -Math.PI / 2);
    },

    'sign.crossroads': say('NORTHWEST: Thistledown Village\nNORTHEAST: The Whispering Grove\nEAST: The Waking Shrine\nSOUTH: over the bridge to the Gloaming Hollow\nSOUTHWEST: Glimmer Lake'),
    'sign.hollow': say('GLOAMING HOLLOW\n"Here ends the lamplighter\'s road. Lamps lit at dusk, snuffed at dawn."\nUnderneath, scratched in fresh and shaky: *TURN BACK*'),
    'trigger.hollow': lamplighterWakes,

    async 'trigger.heartVessel'(api) {
      ow.vessel.collect();
      api.state.set('hollowVessel');
      api.state.maxHp += 2;
      api.state.hp = api.state.maxHp;
      api.sfx.fanfare();
      await api.say([{ text: 'You got a *Heart Vessel*!\nYour life grew by one heart, and you feel completely restored.' }]);
    },
    'sign.village': say('Thistledown Village\n"Mind the windmill. Mind the thornlings more."'),
    'sign.grove': say('The Whispering Grove\nThe trees here are said to remember every song ever played beneath them.'),
    'sign.pedestal': say('Old letters, worn by rain:\n"Sing to the sleeping stone, and the stone shall wake. Rekindle the lantern, and the night shall break."'),
  };

  return {
    scripts,
    restore(state) {
      if (state.has('groveChestOpened')) ow.chest.open(true);
      if (state.has('shrineOpen')) ow.door.setOpen();
      if (state.has('lamplighterDefeated')) {
        ow.hollow.clear();
        ow.lantern.setEmbers(1, true);
        if (!state.has('hollowVessel')) ow.vessel.show();
      }
    },
    start(api) {
      if (api.state.has('lamplighterDefeated') || lamplighter) return;
      // Waits in the middle of the hollow with its back to the road.
      lamplighter = new HollowLamplighter(ow.root, api.physics, ow.hollow, HOLLOW.x, HOLLOW.z + 3, 0);
      lamplighter.onDefeated = () => api.run(lamplighterFalls);
      api.addEnemy(lamplighter);
      ow.hollow.armed = true;
    },
  };
}
