import * as THREE from 'three';
import { POTIONS, REFILL_PRICE, type Potion } from '../game/flasks';
import type { Page, Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import type { Overworld } from '../world/overworld';
import { offerWares, type Ware } from './shop';
import { adultsGone, VANISHED, withNews } from './villageNews';

/** The hour Wren wakes at in Tobin's bed: the next 06:00 or 18:00 (so sleeping at 17:50 wakes at 18:00). */
export const wakeHour = (hours: number) => (hours >= 6 && hours < 18 ? 18 : 6);

/** The guard, taught when Wren picks up the shield. */
export const GUARD_TUTORIAL = 'Hold [shield] to block. Blocks wear down your guard (green bars); it refills only while lowered. At zero, you stagger.';

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
 * When the ward breaks, Maren, Tobin and Odo vanish with the blight (`adultsGone`): only Lark and Pip
 * are left, Pip asks Wren to find them, and Odo's stall works on trust (Wren leaves the gems).
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
        { text: '[gear]Wooden Shield[/]. Scorched, but sound.' },
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
        await api.say([{ who, text: 'Old Hesper said the keepers rang that bell every dawn, and the valley rose with it. I never thought I\'d hear it.' }]);
        return;
      }
      // Before the scare she won't hear of it (a save from before the new opening, which met her, skips this).
      if (!state.has('gotGroveKey') && !state.has('village.scare') && !state.has('metMaren')) {
        await api.say([
          { who, text: 'Wren! Quietly! Nobody goes past the fence, not since the lantern died and the sky turned. You know that.' },
          { who, text: state.isNight
            ? 'It\'s dark now. Sit by the well with me, away from the gaps.'
            : 'Sit by the well where I can see you. The fence is all we have, and I don\'t trust it.' },
        ]);
      } else if (!state.has('gotGroveKey')) {
        await api.say([
          { who, text: 'It was here, by the well. I threw the bucket and it went over the fence.' },
          { who, text: 'A shield? No. Don\'t tell me.' },
          { who, text: 'Old Bram locked his blade in a chest in the [place]Whispering Grove[/], east across the field.' },
          { who, text: 'I\'d rather you stayed in. But something came over our fence, and I\'d rather you had a blade. Here.' },
        ]);
        state.set('metMaren');
        state.set('gotGroveKey');
        state.keys++;
        api.sfx.fanfare();
        await api.say([
          { text: '[gear]Small Key[/]. For old Bram\'s chest.' },
          { who, text: 'From the crossroads sign, northeast past the lone oak. The chest is in the clearing at the end.' },
        ]);
      } else if (!state.has('hasSword')) {
        await api.say([{ who, text: state.isNight
          ? 'Wait for morning, Wren. From the crossroads, northeast, past the lone oak.'
          : 'From the crossroads, northeast past the lone oak. Bram\'s chest is in the clearing.' }]);
      } else if (!state.has('lamplighterDefeated')) {
        await api.say([
          { who, text: 'Bram\'s blade suits you better than it ever suited him.' },
          { who, text: 'The shrine door hasn\'t moved since the lantern died. Tobin swears the flame wasn\'t snuffed. It was carried south.' },
          { who, text: 'South past the bridge: the [place]Gloaming Hollow[/], where old Corwin lit the lamps. They say he still walks them, taller.' },
          { who, text: state.isNight
            ? 'It\'s night. That is when he walks. Be careful.'
            : 'If he has our flame, the door stays shut. Go at night, when he walks. Be careful.' },
        ]);
      } else if (!ow.door.open) {
        await api.say([
          { who, text: 'The lantern glows again, faintly. Something came home last night. Was that you?' },
          { who, text: 'If it burns, the door should wake. Go and see.' },
        ]);
      } else {
        await api.say([{ who, text: state.has('village.stonewardTunic') ? 'You opened it?! Then the old stories are true. And in good slate. Come back in one piece, Wren.' : 'You opened it?! The old stories are true. Come back in one piece, Wren.' }]);
      }
    },

    async 'npc.tobin'(api) {
      const { state } = api;
      const who = 'Tobin the Miller';
      let lines: string[];
      if (state.has('lamplighterDefeated')) {
        lines = [state.isNight ? 'A light streaked east toward the shrine. Now it burns up there. Good news, or I need more sleep.' : 'The lantern\'s lit and the mill turns like nothing happened. Good news. I\'m not used to it.'];
      } else if (state.has('hasSword')) {
        lines = [
          'Going to the shrine? That door\'s shut tighter than my wallet.',
          'The night the lantern died, a cold blue light left the hill, south, toward the [place]Gloaming Hollow[/]. Like it was carried.',
          'Get the flame back and the door opens. Rather you than me.',
        ];
      } else if (state.has('village.scare') && !state.has('gotGroveKey')) {
        lines = ['Something was in the square. Tall, or wide, or both. It didn\'t stay to be looked at.', 'Maren\'s by the well. See she\'s all right.'];
      } else if (!state.has('gotGroveKey')) {
        lines = ['Out in the blight, were you? Bold. Daft, but bold.', 'Keep your voice down. We sit up listening for things at the fence.'];
      } else {
        lines = state.isNight
          ? ['Can\'t sleep either? Wisps come out after dark. Little purple things. One good whack pops them.',
            'Nights feel longer since the lantern died. Or I\'m getting old.']
          : ['The mill needs no wind. It turns because it always has. Don\'t ask me how.',
            'Cut the bushes by the fence for gems. They grow back. Everything does, except my hair.'];
      }
      if (state.bells.hung.has('morrow') && !state.has('village.tobinBell')) {
        state.set('village.tobinBell');
        lines = ['That bell over the square. I thought old Hesper made it up to get us out of bed.'];
      }
      await api.say(lines.map((text) => ({ who, text })));
      // Once Wren is armed, Tobin trusts them with the mill (whichever thing he talked about).
      if (state.has('hasSword') && !state.has('village.millKey')) {
        await api.say([
          { who, text: 'You look like you haven\'t slept in a week. The mill door, west side of the square. There\'s a bed doing nothing.' },
        ]);
        state.set('village.millKey');
        api.sfx.fanfare();
        await api.say([{ text: '[gear]Mill Key[/]. Sleep in the mill till morning or evening.' }]);
      }
    },

    // Lark points Wren at the shield, then gives the idea of riding it (game/surf.ts), then wants to hear how it went.
    async 'npc.lark'(api) {
      const { state } = api;
      const who = 'Lark';
      if (!state.has('hasShield')) {
        await api.say([
          { who, text: 'Psst. Wren. The roofless cottage past the [place]north fence[/]. There\'s a shield in it. I saw it shine.' },
          { who, text: 'Quiet! I\'m not allowed out. Nobody is. You went anyway.' },
        ]);
        return;
      }
      if (!state.has('village.surfIdea')) {
        await api.say([
          { who, text: state.has('gotGroveKey') ? 'Told you it was real! I ride Tobin\'s flour tray down the bank behind the mill. Don\'t tell him.' : 'Told you it was real! Maren threw a bucket at it! I ride Tobin\'s flour tray down the bank. Don\'t tell him.' },
          { who, text: 'Ride it! Jump, get the shield under your feet, land, don\'t let go. That\'s the trick.' },
        ]);
        state.set('village.surfIdea');
        await api.say([
          { text: 'Hold [shield] as you jump and land to ride it, faster than running. Release to step off. Jump and land again to keep speed.' },
          { text: 'Outdoors only. Enemies can knock you off.' },
        ]);
        return;
      }
      if (!state.has('village.surfTried')) {
        await api.say([{ who, text: 'Tried it yet? Jump, shield under your feet, land. Don\'t think too hard. That\'s how you fall.' }]);
        return;
      }
      if (adultsGone(state)) {
        await api.say([{ who, text: state.isNight
          ? 'I\'m sleeping by the well. If anyone comes back over the fence, I\'ll hear first.'
          : 'I can go anywhere now. I keep not going. What if they come back and nobody\'s at the well?' }]);
        return;
      }
      await api.say([{ who, text: state.isNight
        ? 'I saw you in the dark in a cloud of dust. Maren says I\'m too little to ride at night. And by day.'
        : 'I saw you go right past the well! Tobin\'s tray is slower. Don\'t tell him that either.' }]);
    },

    // Pip lost her doll, Button, in a jar at her old house by Glimmer Lake (`lakeHome`'s sixth jar). She
    // talks about Button as if she were a person. Every ask says where to look, but she only asks once Wren has the sword.
    async 'npc.pip'(api) {
      const { state } = api;
      const who = 'Pip';
      state.set('village.metPip');
      if (state.has('village.dollReturned')) {
        await api.say([{ who, text: adultsGone(state)
          ? state.isNight
            ? 'Button can\'t sleep. She listens for the mill. It doesn\'t creak without Tobin.'
            : 'Button and I sweep Odo\'s stall each morning. So it\'s nice when he\'s back.'
          : state.isNight
            ? 'Shh. Button\'s asleep. She hasn\'t slept properly since the lake house. Neither have I.'
            : 'Button says thank you again. She says it every morning. She\'s very polite.' }]);
        return;
      }
      if (state.has('village.dollFound')) {
        await api.say([
          { who, text: 'Button! You found her! She\'s not even wet.' },
          { who, text: 'I hid her in the jar to keep dry. I meant to go back. Then nobody went out.' },
          { who, text: 'Odo gave me these for sweeping. Button says they\'re yours.' },
        ]);
        state.set('village.dollReturned');
        state.addGems(20);
        api.sfx.gem();
        await api.say([{ text: 'Pip gives you 20 gems.' }]);
        return;
      }
      // Before the sword she can't ask for Button (Wren couldn't break the jar): she's just scared.
      if (!state.has('hasSword')) {
        await api.say([{ who, text: state.isNight
          ? 'Something walked past the fence last night. Maren says wind. Wind doesn\'t have feet.'
          : 'The thorns came closer again. Maren says they can\'t get in. She says it very fast.' }]);
        return;
      }
      const where = 'She\'s in a jar at my old house by [place]Glimmer Lake[/]: south over the bridge, the lake\'s east shore.';
      if (adultsGone(state)) {
        await api.say([
          { who, text: 'Everyone\'s away, and Button\'s away. I don\'t like anybody being away.' },
          { who, text: where },
        ]);
      } else if (state.isNight) {
        await api.say([
          { who, text: 'Button hates the dark. She\'s out there alone, and it\'s very dark tonight.' },
          { who, text: where },
        ]);
      } else {
        await api.say([
          { who, text: 'You have a sword now. Could you fetch Button? Jars break if you hit them. She won\'t mind.' },
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
        ? '[gear]Button[/]. Patched, one button eye, dry. Pip is waiting in Thistledown.'
        : '[gear]Stuffed doll[/]. Patched, one button eye, dry. Someone in Thistledown must miss her.' }]);
    },

    // The standing homes: shut, no hint of a key (they open in a later chapter).
    async 'door.home0'(api) {
      await api.say([{ text: 'The door is locked.' }]);
    },
    async 'door.home1'(api) {
      await api.say([{ text: 'The door is locked.' }]);
    },

    // The mill's room is the windmill's ground floor: the door opens and shuts where it stands.
    async 'door.mill'(api) {
      // With Tobin gone, nobody locks it.
      if (!api.state.has('village.millKey') && !adultsGone(api.state)) {
        await api.say([{ text: 'Locked. Tobin keeps the key.' }]);
        return;
      }
      const door = ow.millDoor;
      door.setOpen(!door.open);
      if (door.open) api.sfx.doorOpen();
      else api.sfx.doorShut();
    },

    async 'bed.mill'(api) {
      const wake = wakeHour(api.state.hours);
      const when = wake === 6 ? 'morning' : 'evening';
      const pick = await api.ask([{ text: `Tobin's bed.\nSleep until ${when}?` }], ['Sleep', 'Not now'], 1);
      if (pick !== 0) return;
      await api.fade(1, 0.8);
      api.warpTime(wake);
      await api.until(() => Math.abs(((api.state.hours - wake + 36) % 24) - 12) < 0.05);
      api.state.hp = api.state.maxHp;
      api.sfx.heart();
      await api.wait(0.5);
      await api.fade(0, 0.8);
      api.toast(`You wake in the ${when}, rested.`);
    },

    async 'npc.odo'(api) {
      if (adultsGone(api.state)) return honorStall(api);
      const { state } = api;
      const who = 'Odo the Peddler';
      const tunic = !state.has('village.stonewardTunic');
      const empty = state.flasks.firstEmpty();
      if (!tunic && empty < 0) {
        await api.say([{ who, text: state.isNight ? 'Slate in lamplight. Very mysterious. Stay safe.' : 'It suits you! Slate looks well on a hero.' }]);
        return;
      }
      // What's on offer: the tunic until it's bought, a refill whenever a flask is empty.
      const wares: (Ware & { potion?: Potion })[] = [];
      const pages: Page[] = [{ who, text: state.has('hasSword') && tunic ? 'A blade and no armor! Gems for goods, friend.' : 'Gems for goods, friend. I carry what the valley forgot it needs.' }];
      // Before the scare, Odo is meeting Wren for the first time (everyone else knows Wren).
      if (!state.has('village.scare') && !state.has('metMaren')) pages.unshift({ who, text: 'So this is Wren. I stopped one night, and now the road is thorns and nobody opens the gate. Forgive me if I don\'t sleep.' });
      if (tunic) {
        wares.push({ label: 'Stoneward Tunic', price: 50 });
        pages.push({ who, text: 'A [gear]Stoneward Tunic[/], woven with grit from the shrine quarry. Statues and shells hit half as hard. 50 gems.' });
      }
      if (empty >= 0) {
        for (const potion of ['life', 'attack'] as const) wares.push({ label: POTIONS[potion].name, potion, price: REFILL_PRICE });
        pages.push({ who, text: `Dry flask. ${REFILL_PRICE} gems a fill: [gear]Life[/] heals fully, [gear]Attack[/] doubles your sword's bite for 30 s.` });
      }
      const result = await offerWares(api, pages, wares);
      if (result === 'declined') {
        await api.say([{ who, text: 'Take your time. Stalls don\'t walk.' }]);
      } else if ('short' in result) {
        await api.say([{ who, text: `${result.short.price} gems, friend, and you have ${state.gems}. The bushes by the fence grow back.` }]);
      } else {
        const potion = wares[result.bought].potion;
        if (potion) {
          state.flasks.fill(empty, potion);
          api.sfx.heart();
          await api.say([
            { text: `[gear]${POTIONS[potion].name}[/] in your flask.` },
            { who, text: potion === 'life' ? 'Red as a sunset. Don\'t wait for your last heart.' : 'It fizzes. Save it for something stony.' },
          ]);
        } else {
          state.set('village.stonewardTunic');
          api.player.setStoneward(true);
          api.sfx.fanfare();
          await api.say([
            { text: '[gear]Stoneward Tunic[/]. Stone hits do half damage. Slate-blue.' },
            { who, text: 'Wear it well!' },
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
      for (const v of VANISHED) ow.npcs[v].setPresent(!adultsGone(state));
    },
  };
}

/** Odo's stall with Odo gone: the same wares, and Wren leaves the gems in his cashbox until he's back. */
async function honorStall(api: ScriptApi) {
  const { state } = api;
  const tunic = !state.has('village.stonewardTunic');
  const empty = state.flasks.firstEmpty();
  if (!tunic && empty < 0) {
    await api.say([{ text: 'Odo\'s stall, unminded. The cashbox waits for him.' }]);
    return;
  }
  const wares: (Ware & { potion?: Potion })[] = [];
  if (tunic) wares.push({ label: 'Stoneward Tunic', price: 50 });
  if (empty >= 0) for (const potion of ['life', 'attack'] as const) wares.push({ label: POTIONS[potion].name, potion, price: REFILL_PRICE });
  const result = await offerWares(api, [{ text: 'Odo\'s stall. Leave the gems in his cashbox.' }], wares);
  if (result === 'declined') return;
  if ('short' in result) {
    await api.say([{ text: `${result.short.price} gems, and you have ${state.gems}. Odo wouldn't mind. You would.` }]);
    return;
  }
  const potion = wares[result.bought].potion;
  if (potion) {
    state.flasks.fill(empty, potion);
    api.sfx.heart();
    await api.say([{ text: `You fill your flask with [gear]${POTIONS[potion].name}[/] and leave ${REFILL_PRICE} gems.` }]);
  } else {
    state.set('village.stonewardTunic');
    api.player.setStoneward(true);
    api.sfx.fanfare();
    await api.say([{ text: 'You leave 50 gems and take the [gear]Stoneward Tunic[/]. Stone hits do half damage.' }]);
  }
}
