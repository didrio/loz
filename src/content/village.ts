import * as THREE from 'three';
import { POTIONS, REFILL_PRICE, type Potion } from '../game/flasks';
import type { Page, Script } from '../game/script';
import type { GameState } from '../game/state';
import type { Overworld } from '../world/overworld';
import { offerWares, type Ware } from './shop';
import { withNews } from './villageNews';

/** The guard, taught when Wren picks up the shield. */
export const GUARD_TUTORIAL = 'Hold [shield] to block. Each block wears down your *guard* (the green bars), which refills only while the shield is *lowered*. If it runs out, your guard breaks and you stagger.';

/**
 * Thistledown: the villagers, Tobin's mill door, the opening (the shield in the ruined cottage and
 * the scare that follows it) and Odo's stall.
 *
 * The opening is told only by talking to people (no cutscenes; owner's call, 2026-11-03): until
 * the scare, the villagers scold Wren for being out past the fence, Maren won't hand over anything
 * sharp, and Lark whispers about a shield in the ruined cottage north of the fence. Taking it (any
 * time) sets off a scream in the village; afterwards everyone talks about what came over the fence,
 * and Maren, shaken, gives Wren the key to old Bram's blade. Pip misses her doll, left in a jar at the
 * lake house; bringing it back earns 20 gems.
 *
 * Villagers never name kin (owner's rule, 2026-11-03): they're neighbors, not family. They can
 * remember people who are gone (old Bram, old Hesper, Corwin).
 */
export function villageContent(ow: Overworld) {
  const scripts: Record<string, Script> = {
    async 'pickup.shield'(api) {
      ow.shield.take();
      api.giveShield();
      api.sfx.fanfare();
      api.particles.burst(new THREE.Vector3(ow.shield.x, ow.shield.y + 0.6, ow.shield.z), 0xfff1a8, 24, 3, 1, false);
      await api.say([
        { text: 'You found a *Wooden Shield*!\nScorched at the rim, but the planks are sound.' },
        { text: GUARD_TUTORIAL },
      ]);
      // The scare: a scream from the village, then straight back to play. What it was, the villagers tell.
      if (!api.state.has('village.scare')) {
        api.state.set('village.scare');
        api.sfx.scream();
        await api.wait(0.3);
        await api.say([{ who: 'From the village', text: 'Ahh!!!' }]);
      }
    },

    // Maren gives Wren the key to the grove chest (the sword) once the scare has shaken her; once
    // Wren is armed, the village talk turns to the stolen flame and the Gloaming Hollow; beating
    // the Lamplighter relights the lantern, which wakes the shrine door.
    async 'npc.maren'(api) {
      const { state } = api;
      const who = 'Maren';
      // Once, after the Morrowbell is back on its post (it's the freshest news in the village).
      if (state.has('gotGroveKey') && state.bells.hung.has('morrow') && !state.has('village.marenBell')) {
        state.set('village.marenBell');
        await api.say([{ who, text: 'That bell on the square... Old Hesper used to say the shrine\'s keepers rang it every dawn, and the whole valley got up with it. I never thought I\'d hear it myself.' }]);
        return;
      }
      // Before the scare she won't hear of it (a save from before the new opening, which met her, skips this).
      if (!state.has('gotGroveKey') && !state.has('village.scare') && !state.has('metMaren')) {
        await api.say([
          { who, text: 'Wren! What were you doing out past the fence? Nobody goes out there. Not since the night the lantern went dark. You know that better than anyone.' },
          { who, text: state.isNight
            ? 'It\'s dark now, too. Sit by the well with me. Whatever is out there, it isn\'t worth it.'
            : 'If you need something to do, sit by the well where I can see you. Nobody is going anywhere.' },
        ]);
      } else if (!state.has('gotGroveKey')) {
        await api.say([
          { who, text: 'Wren! It was here, right by the well. I threw the bucket at it, and it just... went over the fence.' },
          { who, text: 'Is that a shield? Where did you... No. Don\'t tell me.' },
          { who, text: 'Old Bram, who kept the fence before all this, locked his blade in a chest in the *Whispering Grove*, northeast of the field. So no fool child would lose a finger.' },
          { who, text: 'I\'d rather you stayed inside. But that thing came over our fence, and I\'d rather you had a blade. Here.' },
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
          : 'Northeast, past the lone oak, to the clearing at the end of the road. Bram\'s chest is waiting.' }]);
      } else if (!state.has('lamplighterDefeated')) {
        await api.say([
          { who, text: 'Bram\'s blade! It suits you better than it ever suited him.' },
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
      } else if (state.has('village.scare') && !state.has('gotGroveKey')) {
        lines = ['Something was in the square. I saw it from the mill door. Tall, or wide, or both. It didn\'t stay to be looked at.', 'Maren\'s by the well. Go and see she\'s all right.'];
      } else if (!state.has('gotGroveKey')) {
        lines = ['Out for a stroll in the blight, were you? Bold. Daft, but bold.', 'If you\'re going to stand there, stand there quietly. Some of us are listening for things.'];
      } else {
        lines = state.isNight
          ? ['Can\'t sleep either? The wisps come out after dark. Little purple things. One good whack pops them.',
            'Nights feel longer since the lantern went out. Or maybe I\'m just getting old.']
          : ['The mill doesn\'t need wind, you know. It turns because it\'s always turned. Don\'t ask me how.',
            'Cut the bushes around the fence if you need gems. They grow back. Everything here grows back. Except my hair.'];
      }
      if (state.bells.hung.has('morrow') && !state.has('village.tobinBell')) {
        state.set('village.tobinBell');
        lines = ['Heard that bell ring out over the square. Haven\'t heard it since I was a boy. I thought it was a story old Hesper made up to get us out of bed.'];
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

    // Lark points Wren at the shield, then gives the idea of riding it (game/surf.ts), then wants to hear how it went.
    async 'npc.lark'(api) {
      const { state } = api;
      const who = 'Lark';
      if (!state.has('hasShield')) {
        await api.say([
          { who, text: 'Psst. Wren. The old cottage past the *north fence*, the one with no roof? There\'s a *shield* in it. I saw it shine from the gap.' },
          { who, text: 'I\'m not allowed out. You\'re not either, but you went anyway.' },
        ]);
        return;
      }
      if (!state.has('village.surfIdea')) {
        await api.say([
          { who, text: state.has('gotGroveKey') ? 'Told you it was real! I ride Tobin\'s flour tray down the bank behind the mill. He doesn\'t know. Don\'t tell him.' : 'Told you it was real! Did you hear Maren? She threw the whole bucket at it! I ride Tobin\'s flour tray down the bank behind the mill, by the way. Don\'t tell him.' },
          { who, text: 'You could ride that! Jump, get it under your feet before you land, and don\'t let go. That\'s the whole trick.' },
        ]);
        state.set('village.surfIdea');
        await api.say([{ text: 'Hold [shield] while you jump and land to *ride your shield*, much faster than running. Keep holding [shield] to ride; let go to step off. It only works outdoors, and enemies can still knock you off.' }]);
        return;
      }
      if (!state.has('village.surfTried')) {
        await api.say([{ who, text: 'Did you try it yet? Jump, shield under your feet, land on it. Don\'t think about it too much. That\'s how you fall off.' }]);
        return;
      }
      await api.say([{ who, text: state.isNight
        ? 'I saw you go past in the dark in a cloud of dust. Maren says I\'m too little to ride at night. She says that about the daytime too.'
        : 'I saw you! You went right past the well! Tobin\'s tray is slower. Don\'t tell him I said that either.' }]);
    },

    // Pip lost her doll, Button, in a jar at her old house by Glimmer Lake (`lakeHome`'s sixth jar). She
    // talks about Button as if she were a person. Every ask says where to look.
    async 'npc.pip'(api) {
      const { state } = api;
      const who = 'Pip';
      state.set('village.metPip');
      if (state.has('village.dollReturned')) {
        await api.say([{ who, text: state.has('valleyOpen')
          ? 'Button wants to see the lake again, now the sky\'s the right color. I said when the grass grows back over the path.'
          : state.isNight
            ? 'Shh. Button\'s asleep. She hasn\'t slept properly since the lake house. Neither have I.'
            : 'Button says thank you again. She says it every morning. She\'s very polite.' }]);
        return;
      }
      if (state.has('village.dollFound')) {
        await api.say([
          { who, text: 'That\'s... Button! You found her! She\'s not even wet.' },
          { who, text: 'I hid her in the jar so she\'d keep dry. I was going to go back for her. Then nobody went out anymore.' },
          { who, text: 'Odo gave me these for sweeping his stall. Button says you should have them.' },
        ]);
        state.set('village.dollReturned');
        state.addGems(20);
        api.sfx.gem();
        await api.say([{ text: 'Pip gives you *20 gems*.' }]);
        return;
      }
      const where = 'She\'s at my old house by *Glimmer Lake*, far southwest, past the river. In one of the jars. I hid her there to keep dry.';
      if (state.has('valleyOpen')) {
        await api.say([
          { who, text: 'The sky\'s the right color again. Button will have seen it, even from inside a jar.' },
          { who, text: where },
        ]);
      } else if (state.isNight) {
        await api.say([
          { who, text: 'Button doesn\'t like the dark. She\'s out there by herself, and it\'s very dark tonight.' },
          { who, text: where },
        ]);
      } else if (state.has('hasSword')) {
        await api.say([
          { who, text: 'You\'ve got a sword now. Could you go and get Button? Jars break if you hit them. She won\'t mind.' },
          { who, text: where },
        ]);
      } else {
        await api.say([
          { who, text: 'Have you seen Button? She\'s small. Patched. One button eye, one stitched one.' },
          { who, text: where },
        ]);
      }
    },

    // Breaking the doll's jar (game/combat.ts runs this for a `doll` drop).
    async 'jar.doll'(api) {
      const { state } = api;
      state.set('village.dollFound');
      api.sfx.fanfare();
      await api.say([{ text: state.has('village.metPip')
        ? 'You found *Button*!\nPatched, one button eye, and dry. Pip is waiting in Thistledown.'
        : 'You found a *stuffed doll*!\nPatched, one button eye, and dry. Someone in Thistledown must miss her.' }]);
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
      // Before the scare, Odo is meeting Wren for the first time (everyone else knows Wren).
      if (!state.has('village.scare') && !state.has('metMaren')) pages.unshift({ who, text: 'So this is Wren. They\'ve talked about nothing else all morning, friend, and not one word of it kind.' });
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
  };

  for (const v of ['maren', 'tobin', 'lark', 'odo'] as const) scripts[`npc.${v}`] = withNews(v, scripts[`npc.${v}`]);
  // Handing the doll back comes before any news (it's what Wren came to say).
  const pip = scripts['npc.pip'], pipNews = withNews('pip', pip);
  scripts['npc.pip'] = (api) => (api.state.has('village.dollFound') && !api.state.has('village.dollReturned') ? pip(api) : pipNews(api));
  return {
    scripts,
    restore(state: GameState) {
      if (state.has('hasShield')) ow.shield.take();
    },
  };
}
