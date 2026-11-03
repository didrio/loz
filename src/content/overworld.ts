import * as THREE from 'three';
import { easeInOut } from '../core/math';
import { HollowLamplighter } from '../game/bosses/lamplighter';
import type { Page, Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import { glow } from '../render/shapes';
import type { Overworld } from '../world/overworld';
import { HOLLOW, HOLLOW_ENTRANCE } from '../world/overworld/layout';
import { POTIONS, REFILL_PRICE, type Potion } from '../game/flasks';
import { bellContent } from './bells';
import { northpassContent } from './northpass';
import { gorgeContent } from './gorge';
import { offerWares, type Ware } from './shop';

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
  const bells = bellContent({ 'bellPost.morrow': ow.morrowPost, 'bellPost.way': ow.wayPost }, { 'bellPickup.morrow': ow.morrowBell, 'bellPickup.way': ow.wayBell });

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
    await api.wait(1.6);
    // Down to the door below: its spiral wakes in the lantern's light.
    const door = doorFace(ow);
    api.shot(new THREE.Vector3(door.x - 9, door.y + 2, door.z + 5), door);
    ow.door.wake();
    await api.wait(2.4);
    api.releaseCamera();
    ow.vessel.show();
    await api.say([{ text: 'The flame is free. Far to the east, the great lantern holds one warm ember again, and the spiral on the shrine door has begun to glow.' }]);
  };

  /**
   * The Lamplighter walks its rounds only at night: it's in the hollow from dusk to dawn
   * (so the fight is always at night, with the night theme's boss version), and gone by day
   * unless a fight is already under way.
   */
  const watchTheHollow = (api: ScriptApi) => {
    if (api.state.has('lamplighterDefeated')) return;
    if (api.state.isNight && !lamplighter) {
      // Waits in the middle of the hollow with its back to the road.
      lamplighter = new HollowLamplighter(ow.root, api.physics, ow.hollow, HOLLOW.x, HOLLOW.z + 3, 0);
      lamplighter.onDefeated = () => api.run(lamplighterFalls);
      api.addEnemy(lamplighter);
      ow.hollow.armed = true;
    } else if (!api.state.isNight && lamplighter && !lamplighter.engaged && !ow.hollow.sealed && lamplighter.alive) {
      api.removeEnemy(lamplighter);
      lamplighter = null;
      ow.hollow.armed = false;
    }
  };

  const scripts: Record<string, Script> = {
    // The quest thread, loosely guided: Maren gives Wren the key to the grove chest (the
    // sword); once Wren is armed, the village talk turns to the stolen flame and the
    // Gloaming Hollow; beating the Lamplighter relights the lantern, which wakes the
    // shrine door. Nobody but the lantern can open it.
    async 'npc.maren'(api) {
      const { state } = api;
      const who = 'Maren';
      // Once, after the Morrowbell is back on its post (it's the freshest news in the village).
      if (state.has('gotGroveKey') && state.bells.hung.has('morrow') && !state.has('village.marenBell')) {
        state.set('village.marenBell');
        await api.say([{ who, text: 'That bell on the square... My mother said the shrine\'s keepers rang it every dawn, and the whole valley got up with it. I never thought I\'d hear it myself.' }]);
        return;
      }
      if (!state.has('gotGroveKey')) {
        await api.say([
          { who, text: 'Wren! You\'re up at last. Did you see the shrine? The lantern on the eastern hill went dark last night. It has burned there since my grandmother\'s grandmother, and now the thornlings are all over Emberfield.' },
          { who, text: 'You can\'t go out there with nothing but a pot lid. My father left a blade in an old chest in the *Whispering Grove*, northeast of the field. He locked it so no fool child would lose a finger.' },
          { who, text: 'Well... you\'re not a child anymore. Here.' },
        ]);
        state.set('metMaren');
        state.set('gotGroveKey');
        state.keys++;
        api.sfx.fanfare();
        await api.say([
          { text: 'You got a *Small Key*!\nIt opens the old chest in the Whispering Grove.' },
          { who, text: 'Follow the road northeast, past the big lone oak. The chest sits in the clearing at the end.' },
        ]);
      } else if (!state.has('hasSword')) {
        await api.say([{ who, text: state.isNight
          ? 'Out at night? Wait for morning, Wren. The grove road is dark enough by day. Northeast, past the lone oak.'
          : 'Northeast, past the lone oak, to the clearing at the end of the road. Father\'s chest is waiting.' }]);
      } else if (!state.has('lamplighterDefeated')) {
        await api.say([
          { who, text: 'Father\'s blade! It suits you better than it ever suited him.' },
          { who, text: 'I\'ve been asking around. The shrine door hasn\'t budged since the lantern went out. The pedestal says the stone wakes while the lantern burns, and Tobin swears the flame wasn\'t snuffed. It was *carried off*, south.' },
          { who, text: 'South past the bridge is the *Gloaming Hollow*, where old Corwin lit the lamps for forty years. They say he still walks his rounds after dark... only taller than he was.' },
          { who, text: state.isNight
            ? 'Be careful, Wren. It\'s night now, and that is exactly when he walks.'
            : 'If he has our flame, that is the only way the door ever opens. Go at night, when he walks. And be careful.' },
        ]);
      } else if (!ow.door.open) {
        await api.say([
          { who, text: 'The lantern is glowing again, just a little. Something came home last night... that was you, wasn\'t it?' },
          { who, text: 'If the lantern burns, the door should wake. Go and see, Wren.' },
        ]);
      } else {
        await api.say([{ who, text: state.has('village.stonewardTunic') ? 'You opened it?! Then the old stories are true. At least you\'ll go down there in good slate. Come back in one piece, Wren.' : 'You opened it?! Then the old stories are true. Whatever is down there, Wren, come back in one piece.' }]);
      }
    },

    async 'npc.tobin'(api) {
      const { state } = api;
      const who = 'Tobin the Miller';
      let lines: string[];
      if (state.has('lamplighterDefeated')) {
        lines = [state.isNight ? 'Saw a light streak east across the sky, toward the shrine. Look at it up there now, burning. Either that\'s good news or I need more sleep.' : 'The lantern\'s lit again, and the mill is turning like nothing happened. Good news, I think. I\'m not used to it.'];
      } else if (state.has('hasSword')) {
        lines = [
          'Going up to the shrine? Don\'t bother. That door\'s shut tighter than my wallet.',
          'The night the lantern died, I saw a cold blue light drift off the hill, slow, like someone carrying it. It went south, toward the Gloaming Hollow. Folk only see anything down there after dark.',
          'Get the flame back and the door opens. Rather you than me.',
        ];
      } else if (!state.has('gotGroveKey')) {
        lines = ['Maren\'s been asking after you all morning. She\'s by the well, in the purple. Go on, before she starts asking me.'];
      } else {
        lines = state.isNight
          ? ['Can\'t sleep either? The wisps come out after dark. Little purple things. One good whack pops them.',
            'Nights feel longer since the lantern went out. Or maybe I\'m just getting old.']
          : ['The mill doesn\'t need wind, you know. It turns because it\'s always turned. Don\'t ask me how.',
            'Cut the bushes around the fence if you need gems. They grow back. Everything here grows back. Except my hair.'];
      }
      if (state.bells.hung.has('morrow') && !state.has('village.tobinBell')) {
        state.set('village.tobinBell');
        lines = ['Heard that bell ring out over the square. Haven\'t heard it since I was a boy. I thought it was a story my father made up to get me out of bed.'];
      }
      await api.say(lines.map((text) => ({ who, text })));
      // Once Wren is armed, Tobin trusts them with the mill (whichever thing he talked about).
      if (state.has('hasSword') && !state.has('village.millKey')) {
        await api.say([
          { who, text: 'You look like you haven\'t slept in a week. Take this: the mill door, west side of the square. There\'s a bed in there doing nothing.' },
        ]);
        state.set('village.millKey');
        api.sfx.fanfare();
        await api.say([{ text: 'You got the *Mill Key*!\nIt opens Tobin\'s mill, where you can sleep until morning or evening and wake fully rested.' }]);
      }
    },

    async 'door.mill'(api) {
      if (!api.state.has('village.millKey')) {
        await api.say([{ text: 'The mill\'s door is locked. Tobin the Miller keeps the key.' }]);
        return;
      }
      await api.travel('mill');
    },

    async 'npc.odo'(api) {
      const { state } = api;
      const who = 'Odo the Peddler';
      const tunic = !state.has('village.stonewardTunic');
      const empty = state.flasks.firstEmpty();
      if (!tunic && empty < 0) {
        await api.say([{ who, text: state.isNight ? 'Slate in the lamplight. Very good, very mysterious. Stay safe out there.' : 'It suits you! Slate looks well on a hero. Come by if you need anything else.' }]);
        return;
      }
      // What's on offer: the tunic until it's bought, a refill whenever a flask is empty.
      const wares: (Ware & { potion?: Potion })[] = [];
      const pages: Page[] = [{ who, text: state.has('hasSword') && tunic ? 'A blade, and no armor! Gems for goods, friend. I carry what the valley forgot it needs.' : 'Gems for goods, friend! I carry what the valley forgot it needs.' }];
      if (tunic) {
        wares.push({ label: 'Stoneward Tunic', price: 50 });
        pages.push({ who, text: 'This is a *Stoneward Tunic*, woven with grit from the old shrine quarry. Statues and stone shells hit you *half as hard*. A bargain at 50 gems.' });
      }
      if (empty >= 0) {
        for (const potion of ['life', 'attack'] as const) wares.push({ label: POTIONS[potion].name, potion, price: REFILL_PRICE });
        pages.push({ who, text: `That flask of yours is dry. I'll fill it for ${REFILL_PRICE} gems: *Life Potion* brings every heart back, *Attack Potion* doubles your sword's bite for half a minute. One flask at a time, mind.` });
      }
      const result = await offerWares(api, pages, wares);
      if (result === 'declined') {
        await api.say([{ who, text: 'Take your time. I\'m not going anywhere. Stalls don\'t walk.' }]);
      } else if ('short' in result) {
        await api.say([{ who, text: `You're short, friend: ${result.short.price} gems, and you have ${state.gems}. Those bushes by the fence grow back, you know.` }]);
      } else {
        const potion = wares[result.bought].potion;
        if (potion) {
          state.flasks.fill(empty, potion);
          api.sfx.heart();
          await api.say([
            { text: `Odo fills your flask with *${POTIONS[potion].name}*.` },
            { who, text: potion === 'life' ? 'Red as a sunset. Don\'t wait for your last heart.' : 'Careful, it fizzes. Save it for something with a lot of stone in it.' },
          ]);
        } else {
          state.set('village.stonewardTunic');
          api.player.setStoneward(true);
          api.sfx.fanfare();
          await api.say([
            { text: 'You got the *Stoneward Tunic*!\nStone hits (statues, shells) do half damage. Your tunic turns slate-blue.' },
            { who, text: 'Wear it in good health!' },
          ]);
        }
      }
    },

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
        { text: 'Hold [shield] to block. Each block wears down your *guard* (the green bars), which refills only while the shield is *lowered*. If it runs out, your guard breaks and you stagger.' },
        { text: 'Maren will want to see this. Head back to *Thistledown*.' },
      ]);
    },

    async 'door.shrine'(api) {
      if (ow.door.awake) {
        await shrineDoorOpens(api, ow);
        return;
      }
      const hint = api.state.has('hasSword')
        ? 'The lantern above it is dark. Whatever took its flame went south, to the Gloaming Hollow.'
        : 'Maybe someone in *Thistledown* knows how to open it.';
      await api.say([{ text: `A slab of cold stone with a spiral carved into it. It won't budge.\n${hint}` }]);
    },

    async 'trigger.shrineEntrance'(api) {
      await api.travel('shrine');
    },

    ...bells.scripts,
    'sign.crossroads': say('NORTHWEST: Thistledown Village\nNORTHEAST: The Whispering Grove\nEAST: The Waking Shrine\nSOUTH: over the bridge to the Gloaming Hollow\nSOUTHWEST: Glimmer Lake'),
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
    'sign.gate': (api) => api.say([{ text: api.state.has('valleyOpen') ? 'The Northpass\nThe old ward is broken. Mind the road: nobody has walked it in a long while.' : 'The Northpass\nClosed by the Keepers\' ward. It has not opened since the lantern went dark.' }]),
    'sign.grove': say('The Whispering Grove\nThe trees here are said to remember every word ever spoken beneath them.'),
    'sign.pedestal': say('Old letters, worn by rain:\n"While the lantern burns, the sleeping stone shall wake. Rekindle the lantern, and the night shall break."'),
  };

  return {
    scripts,
    restore(state) {
      bells.restore(state);
      if (state.has('groveChestOpened')) ow.chest.open(true);
      if (state.has('shrineOpen')) ow.door.setOpen();
      if (state.has('lamplighterDefeated')) {
        ow.hollow.clear();
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
