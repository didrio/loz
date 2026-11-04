/**
 * A stack of menus with up/down selection: the pause menu, the script menus, and the main menu
 * later. Pure logic (no DOM, no input devices): the game feeds it "up / down / confirm /
 * back" from the keyboard, gamepad or mouse, and the HUD draws `view()`.
 */

export type MenuRow = (
  /** Runs `run` when chosen. */
  | { kind: 'action'; label: string; run: () => void; /** A way out (Not now, Stay): drawn red. */ exit?: boolean }
  /** On/off; choosing it flips it and the menu stays open. Left/right set it off/on. */
  | { kind: 'toggle'; label: string; get: () => boolean; set: (on: boolean) => void }
  /** Opens a deeper menu (built fresh each time it's opened). */
  | { kind: 'submenu'; label: string; menu: () => Menu }
  /** A number between `min` and `max` in steps of `step`; left/right (or the mouse) change it, each change applies at once. */
  | { kind: 'slider'; label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void; format: (v: number) => string }
  /** One of several named options; left/right step through them (choosing it cycles). */
  | { kind: 'choice'; label: string; options: string[]; get: () => number; set: (i: number) => void }
  /** Does nothing when chosen; the right-hand pane shows its `detail` while it is selected (a note, a message). */
  | { kind: 'entry'; label: string; detail: string }
) & {
  /** Leaves a gap above the row, to group settings. */
  space?: boolean;
};

export interface Menu {
  title: string;
  /** Text shown under the title (a note to read, or what to do when there are no rows). */
  body?: string;
  rows: MenuRow[];
  /** A small centered window (a script's question), not the full panel. */
  compact?: boolean;
  /** A tab bar over the rows (the pause menu): the labels and which one this menu is. */
  tabs?: { labels: string[]; active: number };
}

/** What the HUD draws. */
export interface MenuView {
  compact?: boolean;
  title: string;
  body?: string;
  rows: { label: string; value?: string; selected: boolean; kind: MenuRow['kind']; space?: boolean; exit?: boolean; /** 0..1 along a slider. */ fill?: number }[];
  tabs?: { labels: string[]; active: number };
  /** The selected entry's text, for the pane beside the list. */
  detail?: { title: string; text: string };
  /** True when left/right do something on the selected row. */
  adjustable: boolean;
}

/** Snaps `v` to the slider's step grid and keeps it in range. */
function snap(row: { min: number; max: number; step: number }, v: number) {
  const n = Math.round((v - row.min) / row.step);
  return Math.min(row.max, Math.max(row.min, +(row.min + n * row.step).toFixed(6)));
}

export class MenuStack {
  private stack: { menu: Menu; selected: number }[] = [];

  get isOpen() {
    return this.stack.length > 0;
  }

  open(root: Menu) {
    this.stack = [{ menu: root, selected: 0 }];
  }

  close() {
    this.stack = [];
  }

  /** Moves the selection, wrapping at the ends. */
  move(dir: -1 | 1) {
    const top = this.top();
    if (!top) return;
    const n = top.menu.rows.length;
    if (!n) return;
    top.selected = (top.selected + dir + n) % n;
  }

  /** Points at a row (the mouse hovering it). */
  select(i: number) {
    const top = this.top();
    if (top && i >= 0 && i < top.menu.rows.length) top.selected = i;
  }

  /** Chooses the selected row. */
  confirm() {
    const top = this.top();
    const row = top?.menu.rows[top.selected];
    if (!row) return;
    if (row.kind === 'action') row.run();
    else if (row.kind === 'toggle') row.set(!row.get());
    else if (row.kind === 'choice') row.set((row.get() + 1) % row.options.length);
    else if (row.kind === 'submenu') this.stack.push({ menu: row.menu(), selected: 0 });
  }

  /** Left (-1) / right (+1) on the selected row. Returns true if it changed something. */
  adjust(dir: -1 | 1, i?: number) {
    const top = this.top();
    if (i !== undefined) this.select(i);
    const row = top?.menu.rows[top.selected];
    if (!row) return false;
    if (row.kind === 'slider') {
      const next = snap(row, row.get() + dir * row.step);
      if (next === row.get()) return false;
      row.set(next);
      return true;
    }
    if (row.kind === 'choice') {
      const next = Math.min(row.options.length - 1, Math.max(0, row.get() + dir));
      if (next === row.get()) return false;
      row.set(next);
      return true;
    }
    if (row.kind === 'toggle') {
      const on = dir > 0;
      if (row.get() === on) return false;
      row.set(on);
      return true;
    }
    return false;
  }

  /** Sets a slider row to a place along it, 0..1 (the mouse clicking or dragging the track). */
  slide(i: number, fraction: number) {
    this.select(i);
    const top = this.top();
    const row = top?.menu.rows[i];
    if (row?.kind !== 'slider') return false;
    const next = snap(row, row.min + Math.min(1, Math.max(0, fraction)) * (row.max - row.min));
    if (next === row.get()) return false;
    row.set(next);
    return true;
  }

  /** Swaps the menu on screen for another without a trip through close/open (the pause menu's tabs). */
  replace(menu: Menu) {
    this.stack = [{ menu, selected: 0 }];
  }

  /** Back one menu; from the first menu, closes. */
  back() {
    this.stack.pop();
  }

  /** The depth: 1 at the first menu. */
  get depth() {
    return this.stack.length;
  }

  view(): MenuView | null {
    const top = this.top();
    if (!top) return null;
    const sel = top.menu.rows[top.selected];
    return {
      title: top.menu.title,
      body: top.menu.body,
      tabs: top.menu.tabs,
      compact: top.menu.compact,
      detail: sel?.kind === 'entry' ? { title: sel.label, text: sel.detail } : undefined,
      adjustable: sel?.kind === 'slider' || sel?.kind === 'choice' || sel?.kind === 'toggle',
      rows: top.menu.rows.map((r, i) => ({
        label: r.label,
        kind: r.kind,
        space: r.space,
        exit: r.kind === 'action' ? r.exit : undefined,
        fill: r.kind === 'slider' ? (r.get() - r.min) / (r.max - r.min) : undefined,
        value:
          r.kind === 'toggle' ? (r.get() ? 'ON' : 'OFF')
          : r.kind === 'submenu' ? '›'
          : r.kind === 'slider' ? r.format(r.get())
          : r.kind === 'choice' ? r.options[r.get()]
          : undefined,
        selected: i === top.selected,
      })),
    };
  }

  private top() {
    return this.stack[this.stack.length - 1];
  }
}
