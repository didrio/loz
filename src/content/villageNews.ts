import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import { foundSigils } from './sigils';

/**
 * How the villagers take the big news, once each (docs/world.md "Story"). First, that Wren has read
 * a sigil: they react reluctantly, and never say his name. Later, that the ward is broken and the
 * blight has lifted: relief, and confusion that he was stone. Either one pre-empts the villager's
 * usual talk for one visit; they go back to it afterwards.
 */
export type Villager = 'maren' | 'tobin' | 'lark' | 'odo' | 'pip';

interface News {
  flag: Flag;
  who: string;
  lines: string[];
}

const NAMES: Record<Villager, string> = { maren: 'Maren', tobin: 'Tobin the Miller', lark: 'Lark', odo: 'Odo the Peddler', pip: 'Pip' };

const SIGIL: Record<Villager, string[]> = {
  maren: [
    'Wren, you\'ve gone pale. You\'ve seen something out there, haven\'t you? Something written?',
    'Don\'t tell me what it says. If I hear it, it\'s true. Just come back, whatever it asks.',
  ],
  tobin: [
    'Words in the air. Sigils, old Hesper called them. I haven\'t seen one since I was a boy.',
    'He was one of ours, you know. There. I\'ve said it. I\'ll not say his name, and neither will you, if you\'re wise.',
  ],
  lark: [
    'Did it say my name? Don\'t tell me. Did it? ...Don\'t tell me.',
    'You\'re not supposed to say who. If you say it, he hears. Everyone knows that.',
  ],
  odo: [
    'A letter written on the air, and addressed to you. I have traveled a long way, friend, and I have never been this glad to be a stranger.',
    'Whoever he is, he knows you. Everyone in this village has gone quiet since you told me. I won\'t ask.',
  ],
  pip: [
    'Everyone\'s whispering about writing in the air. Button doesn\'t want to know what it says.',
    'If it says somebody\'s name, don\'t tell me whose. Button gets nightmares.',
  ],
};

const RELIEF: Record<Villager, string[]> = {
  maren: [
    'Wren, look at the sky. It\'s the right color. I\'d forgotten it was ever the right color.',
    'They say he was stone, all that time. Stone! I don\'t know whether to be glad or to be sick.',
  ],
  tobin: [
    'Sun on the sails. First time since... well. First time.',
    'Stone, they tell me. All that time we were afraid of a man, and he was a rock. It doesn\'t make me less afraid. It makes me sadder, and I don\'t care for it.',
  ],
  lark: [
    'The purple\'s gone! Maren let me out to the well, and nobody even shouted!',
    'Is it true he was a rock? A big one? Did he say anything at the end?',
  ],
  odo: [
    'The pass is open, the sky is blue, and I still have a full cart. Friend, this is the best week of my career.',
    'Stone, all that time. Well. The road past the mountains will have stories, I expect. Mind it.',
  ],
  pip: [
    'The sky\'s the right color! Button always said it would come back. Well. I said it. She agreed.',
    'Was he really stone the whole time? Button thinks that\'s sad. So do I, a bit.',
  ],
};

/** What this villager has to say about the news, if there's any they haven't said yet. */
export function newsFor(villager: Villager, state: GameState): News | null {
  const who = NAMES[villager];
  const relief: Flag = `village.${villager}Relief`;
  const sigil: Flag = `village.${villager}Sigil`;
  if (state.has('valleyOpen') && !state.has(relief)) return { flag: relief, who, lines: RELIEF[villager] };
  if (foundSigils(state).length && !state.has(sigil)) return { flag: sigil, who, lines: SIGIL[villager] };
  return null;
}

/** Wraps a villager's script: any news comes first (the whole visit), and the usual talk resumes next time. */
export function withNews(villager: Villager, script: Script): Script {
  return async (api) => {
    const news = newsFor(villager, api.state);
    if (!news) return script(api);
    api.state.set(news.flag);
    await api.say(news.lines.map((text) => ({ who: news.who, text })));
  };
}
