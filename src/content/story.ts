import type { Script } from '../game/script';

/**
 * A new game: no words (owner's call, 2026-11-03). Wren stands in the field outside the fence; the
 * crossroads sign points home, and the story comes from talking to people.
 */
export const intro: Script = async (api) => {
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
