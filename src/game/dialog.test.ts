import { describe, expect, it } from 'vitest';
import type { Hud } from '../ui/hud';
import { Dialog } from './dialog';

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
