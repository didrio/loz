import { describe, expect, it } from 'vitest';
import type { Hud } from '../ui/hud';
import type { Timeline } from '../core/speech/prosody';
import { Dialog, revealAt } from './dialog';

/** A fake HUD: the dialog is "typed out" at once, and the last choice window is recorded. */
function setup() {
  let choices: { options: string[]; selected: number; exit: number } | null = null;
  const hud = {
    openDialog: () => {},
    closeDialog: () => {},
    finishTyping: () => {},
    dialogDone: true,
    setChoices: (options: string[] | null, selected = 0, exit = -1) => (choices = options ? { options, selected, exit } : null),
  } as unknown as Hud;
  const dialog = new Dialog(hud, { select: () => {} } as never);
  const ask = (options: string[], exit?: number) => {
    const answer = dialog.show([{ text: 'Sleep?' }], options, exit);
    dialog.update(false); // the press that opened it is ignored
    dialog.update(false);
    return answer;
  };
  return { dialog, ask, choices: () => choices };
}

describe('Dialog choice window', () => {
  it('shows the options with the exit row marked and picks with confirm', async () => {
    const { dialog, ask, choices } = setup();
    const answer = ask(['Sleep', 'Not now'], 1);
    expect(choices()).toEqual({ options: ['Sleep', 'Not now'], selected: 0, exit: 1 });
    dialog.update(false, 1);
    expect(choices()!.selected).toBe(1);
    dialog.update(true);
    expect(await answer).toBe(1);
    expect(choices()).toBeNull();
  });

  it('wraps up and down', async () => {
    const { dialog, ask, choices } = setup();
    const answer = ask(['A', 'B', 'C']);
    dialog.update(false, -1);
    expect(choices()!.selected).toBe(2);
    dialog.update(true);
    expect(await answer).toBe(2);
  });

  it('Cancel picks the exit row, and does nothing without one', async () => {
    const a = setup();
    const withExit = a.ask(['Sleep', 'Not now'], 1);
    a.dialog.update(false, 0, true);
    expect(await withExit).toBe(1);

    const b = setup();
    b.ask(['A', 'B']);
    b.dialog.update(false, 0, true);
    expect(b.dialog.open).toBe(true);
  });

  it('takes the mouse: hover highlights, click picks', async () => {
    const { dialog, ask, choices } = setup();
    const answer = ask(['A', 'B', 'C'], 2);
    dialog.hover(1);
    expect(choices()!.selected).toBe(1);
    dialog.click(2);
    expect(await answer).toBe(2);
  });
});

describe('revealAt (text typed along a voice)', () => {
  const word = (index: number, text: string, span: [number, number], start: number, end: number) => ({ index, phrase: 0, text, span, start, end });
  const timeline = { words: [word(0, 'Hello', [0, 5], 0.1, 0.5), word(1, 'there', [7, 12], 0.6, 1.0)], duration: 1.2 } as unknown as Timeline;
  const text = 'Hello, there.';

  it('shows nothing before the first word and everything after the last', () => {
    expect(revealAt(text, timeline, 0)).toBe(0);
    expect(revealAt(text, timeline, 1.0)).toBe(text.length);
  });

  it('spreads a word\'s letters across it and adds its punctuation when it ends', () => {
    expect(revealAt(text, timeline, 0.3)).toBe(2);
    expect(revealAt(text, timeline, 0.55)).toBe(6); // "Hello,"
    expect(revealAt(text, timeline, 0.8)).toBeGreaterThan(7);
  });

  it('never cuts a tag or button name in half', () => {
    const t = '[gear]Hello[/], [attack] now';
    const tl = { words: [word(0, 'Hello', [0, 5], 0, 1), word(1, 'now', [9, 12], 1.2, 1.6)], duration: 2 } as unknown as Timeline;
    expect(t.slice(0, revealAt(t, tl, 1.1))).toBe('[gear]Hello[/],');
    expect(t.slice(0, revealAt(t, tl, 1.3))).toBe('[gear]Hello[/], [attack] ');
  });
});

describe('Dialog voice', () => {
  function voiced() {
    const stops: string[] = [];
    const handle = { startedAt: 0, done: new Promise<void>(() => {}), stop: () => stops.push('stop') };
    const spoken: string[] = [];
    const hud = { openDialog: (_w: string, text: string) => spoken.push(text), closeDialog: () => {}, finishTyping: () => {}, dialogDone: true, setChoices: () => {} } as unknown as Hud;
    const sfx = { select: () => {}, speak: () => handle, voiceTime: () => 0 } as never;
    return { dialog: new Dialog(hud, sfx), stops, spoken };
  }

  it('speaks an NPC page, and the next page, the end and a cut stop it; silent pages do not start one', async () => {
    const { dialog, stops } = voiced();
    const done = dialog.show([{ who: 'Maren', text: 'Wren! Quietly!' }, { who: 'Maren', text: 'Come back.' }, { text: 'Narration.' }]);
    dialog.update(false);
    dialog.update(true); // next page: cuts the first line (and opening the second cuts nothing new)
    expect(stops.length).toBeGreaterThanOrEqual(1);
    const before = stops.length;
    dialog.update(true); // narration: cuts the second line, starts none
    expect(stops.length).toBe(before + 1);
    dialog.update(true);
    expect(await done).toBe(0);
  });
});
