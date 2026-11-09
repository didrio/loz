import * as THREE from 'three';
import { POTIONS, REFILL_PRICE, type Potion } from '../game/flasks';
import type { Page, Script, ScriptApi } from '../game/script';
import type { GameState } from '../game/state';
import type { Overworld } from '../world/overworld';
import { DOLL_REWARD, offerWares, TUNIC_PRICE, type Ware } from './shop';
import { V } from './text/village';
import { adultsGone, VANISHED, withNews } from './villageNews';

/** The hour Wren wakes at in Tobin's bed: the next 06:00 or 18:00 (so sleeping at 17:50 wakes at 18:00). */
export const wakeHour = (hours: number) => (hours >= 6 && hours < 18 ? 18 : 6);

/** The guard, taught when Wren picks up the shield. */
export const GUARD_TUTORIAL = V.guardTutorial;

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
      api.particles.fx('itemSparkle', new THREE.Vector3(ow.shield.x, ow.shield.y + 0.6, ow.shield.z));
      await api.say([
        { text: V.shield.got },
        { text: GUARD_TUTORIAL },
      ]);
      // The scare: a scream from the village, then straight back to play. What it was, the villagers tell.
      if (!api.state.has('village.scare')) {
        api.state.set('village.scare');
        api.sfx.scream();
        await api.wait(0.3);
        await api.say([{ who: V.shield.screamSpeaker, text: V.shield.scream }]);
      }
    },

    // Maren gives Wren the key to the grove chest (the sword) once the scare has shaken her; once
    // Wren is armed, the village talk turns to the stolen flame and the Gloaming Hollow; beating
    // the Lamplighter relights the lantern, which wakes the shrine door.
    async 'npc.maren'(api) {
      const { state } = api;
      const who = V.maren.who;
      const M = V.maren;
      // Once, after the Morrowbell is back on its post (it's the freshest news in the village).
      if (state.has('gotGroveKey') && state.bells.hung.has('morrow') && !state.has('village.marenBell')) {
        state.set('village.marenBell');
        await api.say([{ who, text: M.bell }]);
        return;
      }
      // Before the scare she won't hear of it (a save from before the new opening, which met her, skips this).
      if (!state.has('gotGroveKey') && !state.has('village.scare') && !state.has('metMaren')) {
        await api.say([
          { who, text: M.warn },
          { who, text: state.isNight ? M.stayIn.night : M.stayIn.day },
        ]);
      } else if (!state.has('gotGroveKey')) {
        await api.say([
          { who, text: M.bucket },
          { who, text: M.noShield },
          { who, text: M.bramChest },
          { who, text: M.giveKey },
        ]);
        state.set('metMaren');
        state.set('gotGroveKey');
        state.keys++;
        api.sfx.fanfare();
        await api.say([
          { text: M.keyItem },
          { who, text: M.keyWhere },
        ]);
      } else if (!state.has('hasSword')) {
        await api.say([{ who, text: state.isNight ? M.toChest.night : M.toChest.day }]);
      } else if (!state.has('lamplighterDefeated')) {
        await api.say([
          { who, text: M.blade },
          { who, text: M.carried },
          { who, text: M.hollow },
          { who, text: state.isNight ? M.hollowAdvice.night : M.hollowAdvice.day },
        ]);
      } else if (!ow.door.open) {
        await api.say([
          { who, text: M.lanternLit },
          { who, text: M.doorWakes },
        ]);
      } else {
        await api.say([{ who, text: state.has('village.stonewardTunic') ? M.openedTunic : M.opened }]);
      }
    },

    async 'npc.tobin'(api) {
      const { state } = api;
      const who = V.tobin.who;
      const T = V.tobin;
      let lines: string[];
      if (state.has('lamplighterDefeated')) {
        lines = [state.isNight ? T.lit.night : T.lit.day];
      } else if (state.has('hasSword')) {
        lines = T.armed;
      } else if (state.has('village.scare') && !state.has('gotGroveKey')) {
        lines = T.scare;
      } else if (!state.has('gotGroveKey')) {
        lines = T.blight;
      } else {
        lines = state.isNight ? T.chat.night : T.chat.day;
      }
      if (state.bells.hung.has('morrow') && !state.has('village.tobinBell')) {
        state.set('village.tobinBell');
        lines = T.bell;
      }
      await api.say(lines.map((text) => ({ who, text })));
      // Once Wren is armed, Tobin trusts them with the mill (whichever thing he talked about).
      if (state.has('hasSword') && !state.has('village.millKey')) {
        await api.say([
          { who, text: T.millOffer },
        ]);
        state.set('village.millKey');
        api.sfx.fanfare();
        await api.say([{ text: T.millKey }]);
      }
    },

    // Lark points Wren at the shield, then gives the idea of riding it (game/surf.ts), then wants to hear how it went.
    async 'npc.lark'(api) {
      const { state } = api;
      const who = V.lark.who;
      const L = V.lark;
      if (!state.has('hasShield')) {
        await api.say([
          { who, text: L.psst },
          { who, text: L.quiet },
        ]);
        return;
      }
      if (!state.has('village.surfIdea')) {
        await api.say([
          { who, text: state.has('gotGroveKey') ? L.told.key : L.told.noKey },
          { who, text: L.rideIt },
        ]);
        state.set('village.surfIdea');
        await api.say([
          { text: L.surfTutorial },
          { text: L.surfNote },
        ]);
        return;
      }
      if (!state.has('village.surfTried')) {
        await api.say([{ who, text: L.tried }]);
        return;
      }
      if (adultsGone(state)) {
        await api.say([{ who, text: state.isNight ? L.alone.night : L.alone.day }]);
        return;
      }
      await api.say([{ who, text: state.isNight ? L.chat.night : L.chat.day }]);
    },

    // Pip lost her doll, Button, in a jar at her old house by Glimmer Lake (`lakeHome`'s sixth jar). She
    // talks about Button as if she were a person. Every ask says where to look, but she only asks once Wren has the sword.
    async 'npc.pip'(api) {
      const { state } = api;
      const who = V.pip.who;
      const P = V.pip;
      state.set('village.metPip');
      if (state.has('village.dollReturned')) {
        await api.say([{ who, text: P.returned[adultsGone(state) ? 'gone' : 'home'][state.isNight ? 'night' : 'day'] }]);
        return;
      }
      if (state.has('village.dollFound')) {
        await api.say([
          ...P.found.map((text) => ({ who, text })),
        ]);
        state.set('village.dollReturned');
        ow.npcs.pip.hold(true);
        state.addGems(DOLL_REWARD);
        api.sfx.gem();
        await api.say([{ text: P.reward }]);
        return;
      }
      // Before the sword she can't ask for Button (Wren couldn't break the jar): she's just scared.
      if (!state.has('hasSword')) {
        await api.say([{ who, text: state.isNight ? P.scared.night : P.scared.day }]);
        return;
      }
      const where = P.where;
      if (adultsGone(state)) {
        await api.say([
          { who, text: P.ask.gone },
          { who, text: where },
        ]);
      } else if (state.isNight) {
        await api.say([
          { who, text: P.ask.night },
          { who, text: where },
        ]);
      } else {
        await api.say([
          { who, text: P.ask.day },
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
        ? V.doll.met
        : V.doll.unmet }]);
    },

    // The standing homes: shut, no hint of a key (they open in a later chapter).
    async 'door.home0'(api) {
      await api.say([{ text: V.door.locked }]);
    },
    async 'door.home1'(api) {
      await api.say([{ text: V.door.locked }]);
    },

    // The mill's room is the windmill's ground floor: the door opens and shuts where it stands.
    async 'door.mill'(api) {
      // With Tobin gone, nobody locks it.
      if (!api.state.has('village.millKey') && !adultsGone(api.state)) {
        await api.say([{ text: V.door.millLocked }]);
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
      const pick = await api.ask([{ text: V.bed.prompt(when) }], V.bed.choices, 1);
      if (pick !== 0) return;
      await api.fade(1, 0.8);
      api.warpTime(wake);
      await api.until(() => Math.abs(((api.state.hours - wake + 36) % 24) - 12) < 0.05);
      api.state.hp = api.state.maxHp;
      api.sfx.heart();
      await api.wait(0.5);
      await api.fade(0, 0.8);
      api.toast(V.bed.woke(when));
    },

    async 'npc.odo'(api) {
      if (adultsGone(api.state)) return honorStall(api);
      const { state } = api;
      const who = V.odo.who;
      const O = V.odo;
      const tunic = !state.has('village.stonewardTunic');
      const empty = state.flasks.firstEmpty();
      if (!tunic && empty < 0) {
        await api.say([{ who, text: state.isNight ? O.suits.night : O.suits.day }]);
        return;
      }
      // What's on offer: the tunic until it's bought, a refill whenever a flask is empty.
      const wares: (Ware & { potion?: Potion })[] = [];
      const pages: Page[] = [{ who, text: state.has('hasSword') && tunic ? O.greetArmed : O.greet }];
      // Before the scare, Odo is meeting Wren for the first time (everyone else knows Wren).
      if (!state.has('village.scare') && !state.has('metMaren')) pages.unshift({ who, text: O.meet });
      if (tunic) {
        wares.push({ label: O.tunicWare, price: TUNIC_PRICE });
        pages.push({ who, text: O.tunicPitch });
      }
      if (empty >= 0) {
        for (const potion of ['life', 'attack'] as const) wares.push({ label: POTIONS[potion].name, potion, price: REFILL_PRICE });
        pages.push({ who, text: O.flaskPitch(REFILL_PRICE) });
      }
      const result = await offerWares(api, pages, wares);
      if (result === 'declined') {
        await api.say([{ who, text: O.declined }]);
      } else if ('short' in result) {
        await api.say([{ who, text: O.short(result.short.price, state.gems) }]);
      } else {
        const potion = wares[result.bought].potion;
        if (potion) {
          state.flasks.fill(empty, potion);
          api.sfx.heart();
          await api.say([
            { text: O.filled(POTIONS[potion].name) },
            { who, text: potion === 'life' ? O.lifeFill : O.attackFill },
          ]);
        } else {
          state.set('village.stonewardTunic');
          api.player.setStoneward(true);
          api.sfx.fanfare();
          await api.say([
            { text: O.tunicGot },
            { who, text: O.tunicThanks },
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
      ow.npcs.pip.hold(state.has('village.dollReturned'));
    },
  };
}

/** Odo's stall with Odo gone: the same wares, and Wren leaves the gems in his cashbox until he's back. */
async function honorStall(api: ScriptApi) {
  const { state } = api;
  const tunic = !state.has('village.stonewardTunic');
  const empty = state.flasks.firstEmpty();
  if (!tunic && empty < 0) {
    await api.say([{ text: V.stall.done }]);
    return;
  }
  const wares: (Ware & { potion?: Potion })[] = [];
  if (tunic) wares.push({ label: V.odo.tunicWare, price: TUNIC_PRICE });
  if (empty >= 0) for (const potion of ['life', 'attack'] as const) wares.push({ label: POTIONS[potion].name, potion, price: REFILL_PRICE });
  const result = await offerWares(api, [{ text: V.stall.offer }], wares);
  if (result === 'declined') return;
  if ('short' in result) {
    await api.say([{ text: V.stall.short(result.short.price, state.gems) }]);
    return;
  }
  const potion = wares[result.bought].potion;
  if (potion) {
    state.flasks.fill(empty, potion);
    api.sfx.heart();
    await api.say([{ text: V.stall.filled(POTIONS[potion].name, REFILL_PRICE) }]);
  } else {
    state.set('village.stonewardTunic');
    api.player.setStoneward(true);
    api.sfx.fanfare();
    await api.say([{ text: V.stall.tunic }]);
  }
}
