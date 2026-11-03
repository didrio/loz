import { describe, expect, it } from 'vitest';
import type { Action } from '../core/input';
import type { MenuView } from './menu';
import { ChoiceMenu, type MenuIo } from './menuDriver';

/** A fake game: the actions pressed this frame, and what the HUD was last told to draw. */
function io() {
  const down = new Set<Action>();
  let view: MenuView | null = null;
  const fake: MenuIo = {
    input: { pressed: (a) => down.has(a) },
    hud: { setMenu: (v) => (view = v) },
    sfx: { init: () => {}, select: () => {} },
  };
  const press = (...a: Action[]) => {
    down.clear();
    for (const x of a) down.add(x);
  };
  return { fake, press, view: () => view };
}

describe('ChoiceMenu', () => {
  it('shows the options and resolves with the one chosen', async () => {
    const { fake, press, view } = io();
    const menu = new ChoiceMenu(fake);
    const answer = menu.ask('Where to?', ['Thistledown', 'Hall of Sleepers', 'Stay']);
    expect(view()!.title).toBe('Where to?');
    expect(view()!.rows.map((r) => r.label)).toEqual(['Thistledown', 'Hall of Sleepers', 'Stay']);
    press('menuDown');
    menu.update();
    press('confirm');
    menu.update();
    expect(await answer).toBe(1);
    expect(menu.isOpen).toBe(false);
    expect(view()).toBeNull();
  });

  it('resolves with null when the player backs out', async () => {
    const { fake, press } = io();
    const menu = new ChoiceMenu(fake);
    const answer = menu.ask('Where to?', ['A', 'B']);
    press('cancel');
    menu.update();
    expect(await answer).toBeNull();
    expect(menu.isOpen).toBe(false);
  });

  it('takes a mouse click', async () => {
    const { fake } = io();
    const menu = new ChoiceMenu(fake);
    const answer = menu.ask('Where to?', ['A', 'B', 'C']);
    menu.driver.click(2);
    expect(await answer).toBe(2);
  });
});
