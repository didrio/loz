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
    'You\'ve gone pale, Wren. You saw something written, didn\'t you?',
    'Don\'t tell me what it says. If I hear it, it\'s true. Just come back.',
  ],
  tobin: [
    'Words in the air. [old]Sigils[/], old Hesper called them. Not seen one since I was a boy.',
    'He was one of ours. There, I\'ve said it. I\'ll not say his name, and neither should you.',
  ],
  lark: [
    'Did it say my name? Don\'t tell me. Did it? ...Don\'t tell me.',
    'If you say who, he hears. Everyone knows that.',
  ],
  odo: [
    'A letter on the air, addressed to you. I\'ve never been so glad to be a stranger.',
    'Whoever he is, he knows you. The village went quiet when you told me. I won\'t ask.',
  ],
  pip: [
    'Everyone\'s whispering about writing in the air. Button doesn\'t want to know.',
    'If it says a name, don\'t tell me whose. Button gets nightmares.',
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
      'Wren! The purple\'s gone! I ran round the fence and nobody shouted!',
      '...Nobody shouted because nobody\'s here. Maren, Tobin, Odo. I looked in the mill. Under Odo\'s stall.',
      'Pip wants to ask you something. She\'s by the cottage.',
    ],
  },
  pip: {
    flag: 'village.searchAsked',
    lines: [
      'The sky\'s the right color. I ran to tell Maren. Nobody was anywhere.',
      'It was like the purple took them with it.',
      'Lark says they\'re hiding. Grown-ups don\'t hide. Not all at once.',
      'Please, could you look for them? Past the fence. Past everywhere.',
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
