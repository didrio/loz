import { describe, expect, it, vi } from 'vitest';
import { MenuStack, type Menu } from './menu';

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
    expect(stack.view()!.rows[0].value).toBe('ON');
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
      expect(stack.view()!.rows[1].value).toBe('Mid');
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
