import type { Script } from '../game/script';

/** Opening narration for a new game. */
export const intro: Script = async (api) => {
  await api.say([
    { text: 'Last night, the lantern atop the Waking Shrine flickered, and went out.' },
    { text: 'By morning, thornlings were crawling across Emberfield, and Thistledown had shut its gates.' },
    { text: 'Wren, go and see Maren in *Thistledown*, up the road to the northwest.\n(Move with *WASD* or the left stick. *Click* the screen to look around with the mouse.)' },
  ]);
  api.showAreaName('Emberfield');
};

/** Hearts ran out: fade out and wake up at the start of the area. */
export const death: Script = async (api) => {
  // The music stops dead, a falling chord, the screen goes black and stays black a beat:
  // it should feel like a game over, not a teleport. Then a fresh start, music and all.
  api.silenceMusic(true);
  api.sfx.defeat();
  await api.wait(1);
  await api.fade(1, 1.2);
  await api.wait(0.9);
  api.respawn();
  await api.wait(0.3);
  api.silenceMusic(false);
  await api.fade(0, 0.9);
};
