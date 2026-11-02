import type { Script } from '../game/script';
import type { SongId } from '../game/songs';
import { Overworld } from '../world/overworld';
import { shrineDoorOpens } from './overworld';

/** Opening narration for a new game. */
export const intro: Script = async (api) => {
  await api.say([
    { text: 'Last night, the lantern atop the Waking Shrine flickered... and went out.' },
    { text: 'By morning, thornlings were crawling across Emberfield, and the village of Thistledown had shut its gates early.' },
    { text: 'Wren, you should go see Maren in *Thistledown*, up the road to the northwest.\n(Move with *WASD* or the left stick. *Click* the screen to look around with the mouse.)' },
  ]);
  api.showAreaName('Emberfield');
};

/** Hearts ran out: fade out and wake up at the start of the area. */
export const death: Script = async (api) => {
  await api.wait(1);
  await api.fade(1, 1.2);
  api.respawn();
  await api.wait(0.3);
  await api.fade(0, 0.6);
  api.toast('You wake up back where you started.');
};

/** What each song does after it's played. */
export const songEffects: Record<SongId, Script> = {
  async hours(api) {
    const night = api.state.isNight;
    api.warpTime(night ? 6 : 18);
    await api.say([{ text: night ? 'The stars dim and the sky turns pale. Morning is coming.' : 'The sun slides toward the hills. Night is coming.' }]);
  },

  async waking(api) {
    const ow = api.area instanceof Overworld ? api.area : null;
    if (ow && ow.door.opening) {
      await api.say([{ text: 'The melody drifts down into the open shrine and echoes back.' }]);
    } else if (ow && Math.hypot(api.player.pos.x - ow.door.x, api.player.pos.z - ow.door.z) < 14) {
      await shrineDoorOpens(api, ow);
    } else {
      await api.say([{ text: 'The melody drifts over the field. Somewhere to the east, stone seems to stir.' }]);
    }
  },
};
