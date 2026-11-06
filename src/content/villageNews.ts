import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import { foundSigils } from './sigils';
import { NEWS } from './text/news';

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
  lines: readonly string[];
}

const NAMES: Record<Villager, string> = NEWS.names;

const SIGIL: Record<Villager, readonly string[]> = NEWS.sigil;

/**
 * The ward breaks and the blight lifts, and Maren, Tobin and Odo vanish with it (docs/world.md "Story"):
 * only the kids are left to say so. Lark is glad, then not; Pip, the shy one, asks Wren to find them
 * (`village.searchAsked`, which the rescue quests will start from).
 */
const RELIEF: Partial<Record<Villager, { flag: Flag; lines: readonly string[] }>> = {
  lark: { flag: 'village.larkRelief', lines: NEWS.relief.lark },
  pip: { flag: 'village.searchAsked', lines: NEWS.relief.pip },
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
