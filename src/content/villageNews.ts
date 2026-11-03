import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import { foundSigils } from './sigils';

/**
 * How the villagers take the big news, once each (docs/world.md "Story"). First, that Wren has read
 * a sigil: they react reluctantly, and never say his name. Later, that the ward is broken and the
 * blight has lifted, and the grown-ups with it: the kids tell Wren (RELIEF). Either one pre-empts the villager's
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

/**
 * The ward breaks and the blight lifts, and Maren, Tobin and Odo vanish with it (docs/world.md "Story"):
 * only the kids are left to say so. Lark is glad, then not; Pip, the shy one, asks Wren to find them
 * (`village.searchAsked`, which the rescue quests will start from).
 */
const RELIEF: Partial<Record<Villager, { flag: Flag; lines: string[] }>> = {
  lark: {
    flag: 'village.larkRelief',
    lines: [
      'Wren! The purple\'s gone! I ran all the way round the fence and nobody even shouted!',
      '...Nobody shouted because nobody\'s here. Maren, Tobin, Odo. When the sky went blue they just weren\'t anywhere. I looked in the mill. I looked under Odo\'s stall.',
      'Pip wants to ask you something. She keeps asking me to ask you. Go on, she\'s by the cottage.',
    ],
  },
  pip: {
    flag: 'village.searchAsked',
    lines: [
      'The sky\'s the right color. I ran to tell Maren, and she wasn\'t at the well. Nobody was anywhere.',
      'It was like the purple went away and took them with it.',
      'Lark says they\'re hiding. Grown-ups don\'t hide. Not all at once.',
      'You go out there. Past the fence, past everywhere. Could you... look for them? Please?',
    ],
  },
};

/** Gone with the blight: from the moment the ward breaks until Wren brings them home (later quests). */
export const VANISHED = ['maren', 'tobin', 'odo'] as const satisfies readonly Villager[];

export function adultsGone(state: GameState) {
  return state.has('valleyOpen');
}

/** What this villager has to say about the news, if there's any they haven't said yet. */
export function newsFor(villager: Villager, state: GameState): News | null {
  const who = NAMES[villager];
  const sigil: Flag = `village.${villager}Sigil`;
  // Once the blight lifts, the old whispers about the sigils are stale: the only news is who's missing.
  if (adultsGone(state)) {
    const relief = RELIEF[villager];
    return relief && !state.has(relief.flag) ? { flag: relief.flag, who, lines: relief.lines } : null;
  }
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
