import { describe, expect, it } from 'vitest';
import type { Action } from '../core/input';
import type { MenuView } from './menu';
import { ChoiceMenu, MenuDriver, type MenuIo } from './menuDriver';

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

describe('MenuDriver hide key', () => {
  const rows = () => [{ kind: 'toggle' as const, label: 'Shadows', get: () => true, set: () => {} }];

  it('holding it makes the view a live one (the camera may turn), releasing ends it', () => {
    const { fake, view } = io();
    const driver = new MenuDriver(fake);
    driver.open({ title: 'Paused', rows: rows() });
    expect(driver.liveView).toBe(false);
    driver.setPeek(true);
    expect(driver.liveView).toBe(true);
    expect(view()!.peeking).toBe(true);
    driver.setPeek(false);
    expect(view()!.peeking).toBeUndefined();
  });

  it('closing forgets it', () => {
    const { fake } = io();
    const driver = new MenuDriver(fake);
    driver.open({ title: 'Paused', rows: rows() });
    driver.setPeek(true);
    driver.close();
    driver.open({ title: 'Paused', rows: rows() });
    expect(driver.liveView).toBe(false);
  });

  it('the reset key and the mouse put the selected / named row back to its default', () => {
    const { fake, press, view } = io();
    const driver = new MenuDriver(fake);
    let a = 3;
    let b = 5;
    driver.open({ title: 'S', rows: [
      { kind: 'slider', label: 'A', def: 1, min: 0, max: 9, step: 1, get: () => a, set: (v) => (a = v), format: String },
      { kind: 'slider', label: 'B', def: 2, min: 0, max: 9, step: 1, get: () => b, set: (v) => (b = v), format: String },
    ] });
    press('menuReset');
    driver.update();
    expect(a).toBe(1);
    expect(view()!.rows[0].changed).toBe(false);
    driver.reset(1);
    expect(b).toBe(2);
  });

  it('a mouse pick on a choice row goes through', () => {
    const { fake, view } = io();
    const driver = new MenuDriver(fake);
    let at = 0;
    driver.open({ title: 'Paused', rows: [{ kind: 'choice', label: 'Display', options: ['A', 'B', 'C'], get: () => at, set: (i) => (at = i) }] });
    driver.pick(0, 2);
    expect(at).toBe(2);
    expect(view()!.rows[0].index).toBe(2);
  });
});

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

  it('marks the exit row and backs out with cancel', async () => {
    const { fake, view } = io();
    const menu = new ChoiceMenu(fake);
    menu.ask('Where to?', ['A', 'Stay'], 1);
    expect(view()!.rows.map((r) => !!r.exit)).toEqual([false, true]);
    expect(view()!.compact).toBe(true);
  });

  it('takes a mouse click', async () => {
    const { fake } = io();
    const menu = new ChoiceMenu(fake);
    const answer = menu.ask('Where to?', ['A', 'B', 'C']);
    menu.driver.click(2);
    expect(await answer).toBe(2);
  });
});

describe('MenuDriver: left/right and tabs', () => {
  function slider() {
    const down = new Set<Action>();
    const held = new Set<Action>();
    let v = 0.5;
    const fake: MenuIo = {
      input: { pressed: (a) => down.has(a), held: (a) => held.has(a) },
      hud: { setMenu: () => {} },
      sfx: { init: () => {}, select: () => {} },
    };
    const driver = new MenuDriver(fake);
    driver.open({ title: 'S', rows: [{ kind: 'slider', label: 'V', min: 0, max: 1, step: 0.1, get: () => v, set: (x) => (v = x), format: String }] });
    const frame = (pressed: Action[] = [], holding: Action[] = []) => {
      down.clear();
      held.clear();
      pressed.forEach((a) => (down.add(a), held.add(a)));
      holding.forEach((a) => held.add(a));
      driver.update();
    };
    return { driver, frame, v: () => v };
  }

  it('right changes a slider once per press, then repeats while held', () => {
    const { frame, v } = slider();
    frame(['menuRight']);
    expect(v()).toBeCloseTo(0.6);
    for (let i = 0; i < 10; i++) frame([], ['menuRight']);
    expect(v()).toBeCloseTo(0.6); // not yet repeating
    for (let i = 0; i < 20; i++) frame([], ['menuRight']);
    expect(v()).toBeGreaterThan(0.8);
    frame(); // released
    const after = v();
    frame();
    expect(v()).toBe(after);
  });

  it('tab buttons call onTab instead of confirming (E is both)', () => {
    const { driver, frame, v } = slider();
    const tabs: number[] = [];
    driver.onTab = (d) => tabs.push(d);
    frame(['tabNext', 'confirm']);
    frame(['tabPrev']);
    expect(tabs).toEqual([1, -1]);
    expect(v()).toBe(0.5);
  });
});
