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
});
