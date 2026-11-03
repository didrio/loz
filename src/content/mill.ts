import type { Script } from '../game/script';
import type { GameState } from '../game/state';
import type { MillInterior } from '../world/interior';
import type { AreaContent } from './overworld';

/** The hour Wren wakes at: the next 06:00 or 18:00 (so sleeping at 17:50 wakes at 18:00). */
export const wakeHour = (hours: number) => (hours >= 6 && hours < 18 ? 18 : 6);

/** Tobin's mill: the bed, and the way back out. */
export function millContent(_area: MillInterior): AreaContent {
  const scripts: Record<string, Script> = {
    async exit(api) {
      await api.travel('overworld', 'mill');
    },

    async bed(api) {
      const wake = wakeHour(api.state.hours);
      const when = wake === 6 ? 'morning' : 'evening';
      const pick = await api.ask([{ text: `A narrow bed under a patchwork blanket.\nSleep until ${when}? You'll wake fully rested.` }], ['Sleep', 'Not now']);
      if (pick !== 0) return;
      await api.fade(1, 0.8);
      api.warpTime(wake);
      await api.until(() => Math.abs(((api.state.hours - wake + 36) % 24) - 12) < 0.05);
      api.state.hp = api.state.maxHp;
      api.sfx.heart();
      await api.wait(0.5);
      await api.fade(0, 0.8);
      api.toast(`You wake in the ${when}, fully rested.`);
    },
  };
  return { scripts, restore: (_state: GameState) => {} };
}
