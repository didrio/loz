import { describe, expect, it, vi } from 'vitest';
import { changedSummary, menuSummary, MenuStack, resetRow, rowIsDefault, type Menu, type MenuRow } from './menu';

function make() {
  let on = false;
  const run = vi.fn();
  const sub: Menu = { title: 'Sub', rows: [{ kind: 'action', label: 'Go', run }, { kind: 'action', label: 'Other', run: () => {} }] };
  const root: Menu = {
    title: 'Root',
    rows: [
      { kind: 'toggle', label: 'Flag', get: () => on, set: (v) => (on = v) },
      { kind: 'submenu', label: 'More', menu: () => sub },
    ],
  };
  return { root, run, isOn: () => on, stack: new MenuStack() };
}

describe('MenuStack', () => {
  it('is closed until opened, and shows the first row selected', () => {
    const { stack, root } = make();
    expect(stack.isOpen).toBe(false);
    expect(stack.view()).toBeNull();
    stack.open(root);
    expect(stack.view()!.rows.map((r) => r.selected)).toEqual([true, false]);
  });

  it('moves and wraps', () => {
    const { stack, root } = make();
    stack.open(root);
    stack.move(-1);
    expect(stack.view()!.rows[1].selected).toBe(true);
    stack.move(1);
    expect(stack.view()!.rows[0].selected).toBe(true);
  });

  it('a toggle flips and the menu stays open', () => {
    const { stack, root, isOn } = make();
    stack.open(root);
    stack.confirm();
    expect(isOn()).toBe(true);
    expect(stack.isOpen).toBe(true);
    expect(stack.view()!.rows[0].on).toBe(true);
    stack.confirm();
    expect(isOn()).toBe(false);
  });

  it('a submenu opens on top, back returns to the row it came from, back from the root closes', () => {
    const { stack, root, run } = make();
    stack.open(root);
    stack.move(1);
    stack.confirm();
    expect(stack.view()!.title).toBe('Sub');
    stack.confirm();
    expect(run).toHaveBeenCalledOnce();
    stack.back();
    expect(stack.view()!.title).toBe('Root');
    expect(stack.view()!.rows[1].selected).toBe(true);
    stack.back();
    expect(stack.isOpen).toBe(false);
  });

  it('hover selects a row, out-of-range is ignored', () => {
    const { stack, root } = make();
    stack.open(root);
    stack.select(1);
    expect(stack.view()!.rows[1].selected).toBe(true);
    stack.select(9);
    expect(stack.view()!.rows[1].selected).toBe(true);
  });

  it('shows a body, and survives having no rows (an empty notes page)', () => {
    const stack = new MenuStack();
    stack.open({ title: 'Notes', body: 'Nothing yet.', rows: [] });
    stack.move(1);
    stack.move(-1);
    stack.confirm();
    expect(stack.view()).toMatchObject({ title: 'Notes', body: 'Nothing yet.', rows: [] });
    stack.back();
    expect(stack.isOpen).toBe(false);
  });

  describe('sliders, choices and entries', () => {
    function settings() {
      let vol = 0.5;
      let q = 1;
      const root: Menu = {
        title: 'S',
        rows: [
          { kind: 'slider', label: 'Vol', min: 0, max: 1, step: 0.05, get: () => vol, set: (v) => (vol = v), format: (v) => `${Math.round(v * 100)}%` },
          { kind: 'choice', label: 'Q', options: ['Low', 'Mid', 'High'], get: () => q, set: (i) => (q = i) },
          { kind: 'entry', label: 'Note', detail: 'Read me' },
        ],
      };
      const stack = new MenuStack();
      stack.open(root);
      return { stack, vol: () => vol, q: () => q };
    }

    it('left/right step a slider, stop at the ends and show a value and fill', () => {
      const { stack, vol } = settings();
      expect(stack.adjust(1)).toBe(true);
      expect(vol()).toBeCloseTo(0.55);
      expect(stack.view()!.rows[0]).toMatchObject({ value: '55%', fill: 0.55, kind: 'slider' });
      for (let i = 0; i < 40; i++) stack.adjust(1);
      expect(vol()).toBe(1);
      expect(stack.adjust(1)).toBe(false);
      for (let i = 0; i < 40; i++) stack.adjust(-1);
      expect(vol()).toBe(0);
    });

    it('the mouse sets a slider by position, snapped to its step', () => {
      const { stack, vol } = settings();
      stack.slide(0, 0.731);
      expect(vol()).toBeCloseTo(0.75);
      stack.slide(0, 2);
      expect(vol()).toBe(1);
      stack.slide(0, -1);
      expect(vol()).toBe(0);
    });

    it('a choice steps with left/right (no wrap) and cycles when chosen', () => {
      const { stack, q } = settings();
      stack.move(1);
      expect(stack.view()!.rows[1].options![stack.view()!.rows[1].index!]).toBe('Mid');
      stack.adjust(1);
      expect(q()).toBe(2);
      expect(stack.adjust(1)).toBe(false);
      stack.confirm();
      expect(q()).toBe(0);
    });

    it('an entry does nothing when chosen and shows its detail while selected', () => {
      const { stack } = settings();
      expect(stack.view()!.detail).toBeUndefined();
      stack.move(-1);
      expect(stack.view()!.detail).toEqual({ title: 'Note', text: 'Read me' });
      expect(stack.view()!.adjustable).toBe(false);
      stack.confirm();
      expect(stack.isOpen).toBe(true);
    });
  });
});

describe('toggles and choices as controls', () => {
  const rows = (): MenuRow[] => {
    let shadows = true;
    let display = 1;
    let exposure = 0.5;
    return [
      { kind: 'action', label: 'Go', run: () => {} },
      { kind: 'toggle', label: 'Shadows', get: () => shadows, set: (v) => (shadows = v) },
      { kind: 'choice', label: 'Display', options: ['Native', 'Performance', 'N64'], get: () => display, set: (i) => (display = i) },
      { kind: 'slider', label: 'Exposure', min: 0, max: 2, step: 0.05, get: () => exposure, set: (v) => (exposure = v), format: (v) => v.toFixed(2) },
    ];
  };

  it('the view gives a toggle its state and a choice all its options with the chosen one', () => {
    const stack = new MenuStack();
    stack.open({ title: 'Settings', rows: rows() });
    const [go, shadows, display, exposure] = stack.view()!.rows;
    expect(go.on).toBeUndefined();
    expect(shadows.on).toBe(true);
    expect(shadows.value).toBeUndefined();
    expect(display.options).toEqual(['Native', 'Performance', 'N64']);
    expect(display.index).toBe(1);
    expect(exposure.value).toBe('0.50');
  });

  it('pick chooses one option of a choice row, and only a choice row', () => {
    const stack = new MenuStack();
    stack.open({ title: 'Settings', rows: rows() });
    expect(stack.pick(2, 2)).toBe(true);
    expect(stack.view()!.rows[2].index).toBe(2);
    expect(stack.pick(2, 2)).toBe(false); // already chosen
    expect(stack.pick(2, 3)).toBe(false); // no such option
    expect(stack.pick(1, 0)).toBe(false); // a toggle
  });

  it('menuSummary lists the settings and skips actions', () => {
    expect(menuSummary(rows())).toBe('Shadows: ON\nDisplay: Performance\nExposure: 0.50');
  });
});

describe('defaults and reset', () => {
  const make = () => {
    let shadows = true;
    let display = 2;
    let level = 0.5;
    const rows: MenuRow[] = [
      { kind: 'toggle', label: 'Shadows', def: true, get: () => shadows, set: (v) => (shadows = v) },
      { kind: 'choice', label: 'Display', def: 0, options: ['Native', 'Performance', 'N64'], get: () => display, set: (i) => (display = i) },
      { kind: 'slider', label: 'Level', def: 0.3, min: 0, max: 1, step: 0.05, get: () => level, set: (v) => (level = v), format: (v) => v.toFixed(2) },
      { kind: 'toggle', label: 'No default', get: () => true, set: () => {} },
    ];
    return { rows, now: () => ({ shadows, display, level }) };
  };

  it('a row is at its default, or away from it; a row with no default never is', () => {
    const { rows } = make();
    expect(rows.map(rowIsDefault)).toEqual([true, false, false, true]);
  });

  it('resetRow puts a row back and says whether it changed anything', () => {
    const { rows, now } = make();
    expect(resetRow(rows[1])).toBe(true);
    expect(resetRow(rows[2])).toBe(true);
    expect(now()).toEqual({ shadows: true, display: 0, level: 0.3 });
    expect(resetRow(rows[1])).toBe(false);
    expect(resetRow(rows[3])).toBe(false);
  });

  it('the view marks rows that have a default and rows that are away from it; the selected one decides `resettable`', () => {
    const { rows } = make();
    const stack = new MenuStack();
    stack.open({ title: 'S', rows });
    const v = stack.view()!;
    expect(v.rows.map((r) => r.resettable)).toEqual([true, true, true, false]);
    expect(v.rows.map((r) => r.changed)).toEqual([false, true, true, false]);
    expect(v.resettable).toBe(false);
    stack.move(1);
    expect(stack.view()!.resettable).toBe(true);
  });

  it('the stack resets the selected row, or a named one', () => {
    const { rows, now } = make();
    const stack = new MenuStack();
    stack.open({ title: 'S', rows });
    expect(stack.reset(2)).toBe(true);
    expect(now().level).toBe(0.3);
    expect(stack.reset()).toBe(false); // row 2 is selected and already at its default
    stack.move(-1);
    expect(stack.reset()).toBe(true); // row 1
    expect(now().display).toBe(0);
  });

  it('changedSummary lists only the rows away from their defaults, with the default', () => {
    expect(changedSummary(make().rows)).toBe('Display: N64 (default Native)\nLevel: 0.50 (default 0.30)');
  });
});

describe('locked rows', () => {
  it('show as locked and ignore every change while locked', () => {
    let locked = true;
    let level = 3;
    let pick = 0;
    let on = false;
    const stack = new MenuStack();
    stack.open({ title: 'S', rows: [
      { kind: 'slider', label: 'Level', def: 1, min: 0, max: 9, step: 1, get: () => level, set: (v) => (level = v), format: String, locked: () => locked },
      { kind: 'choice', label: 'Pick', options: ['A', 'B'], get: () => pick, set: (i) => (pick = i), locked: () => locked },
      { kind: 'toggle', label: 'On', get: () => on, set: (v) => (on = v), locked: () => locked },
    ] });
    expect(stack.view()!.rows.map((r) => r.locked)).toEqual([true, true, true]);
    expect(stack.view()!.adjustable).toBe(false);
    expect(stack.view()!.resettable).toBe(false);
    expect(stack.adjust(1, 0)).toBe(false);
    expect(stack.slide(0, 1)).toBe(false);
    expect(stack.reset(0)).toBe(false);
    expect(stack.pick(1, 1)).toBe(false);
    stack.select(2);
    stack.confirm();
    expect([level, pick, on]).toEqual([3, 0, false]);
    locked = false;
    expect(stack.view()!.rows[0].locked).toBeUndefined();
    expect(stack.adjust(1, 0)).toBe(true);
    expect(level).toBe(4);
  });
});
