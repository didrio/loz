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
  | { kind: 'entry'; label: string; detail: string; /** A picture beside the label and over the text (a PNG data URL, '' for none). */ icon?: string }
) & {
  /** Leaves a gap above the row, to group settings. */
  space?: boolean;
  /** A small heading over this row, naming the group of rows from here on. */
  group?: string;
  /** The value this setting starts at (a toggle's state, a slider's number, a choice's index). With it the row gets a reset button. */
  def?: number | boolean;
  /** Drawn in a footer under the list instead of in it (the dev panel's Default switch). Up/down still reach it, in array order. */
  pinned?: boolean;
  /** While this says true the row is shown dimmed and ignores every change (the dev panel's visual rows while Default is on). */
  locked?: () => boolean;
};

const near = (a: number | boolean, b: number | boolean) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b);

/** True when a row has no default to go back to, or already sits at it. */
export function rowIsDefault(r: MenuRow): boolean {
  if (r.def === undefined) return true;
  return r.kind === 'toggle' || r.kind === 'slider' || r.kind === 'choice' ? near(r.get(), r.def) : true;
}

/** Sets a row back to its default. Returns true if that changed anything. */
export function resetRow(r: MenuRow): boolean {
  if (r.def === undefined || rowIsDefault(r)) return false;
  if (r.kind === 'toggle') r.set(!!r.def);
  else if (r.kind === 'slider') r.set(Number(r.def));
  else if (r.kind === 'choice') r.set(Number(r.def));
  else return false;
  return true;
}

/** The default as the row would show it ("ON", "0.30", "Native"). */
function defaultText(r: MenuRow): string {
  if (r.kind === 'toggle') return r.def ? 'ON' : 'OFF';
  if (r.kind === 'slider') return r.format(Number(r.def));
  if (r.kind === 'choice') return r.options[Number(r.def)];
  return '';
}

/** The rows that are not at their defaults, as "Label: value (default X)" lines (empty when none). */
export function changedSummary(rows: MenuRow[]): string {
  return rows.filter((r) => !rowIsDefault(r)).map((r) => `${r.label}: ${rowValue(r)} (default ${defaultText(r)})`).join('\n');
}

/** The text a row shows on its right (a slider's number, an option's name); toggles and choices are drawn as controls. */
export function rowValue(r: MenuRow): string | undefined {
  return r.kind === 'toggle' ? (r.get() ? 'ON' : 'OFF')
    : r.kind === 'submenu' ? '›'
    : r.kind === 'slider' ? r.format(r.get())
    : r.kind === 'choice' ? r.options[r.get()]
    : undefined;
}

/** Every setting row's current value as lines of text ("Shadows: ON"), to paste to an agent. */
export function menuSummary(rows: MenuRow[]): string {
  return rows.filter((r) => r.kind === 'toggle' || r.kind === 'slider' || r.kind === 'choice').map((r) => `${r.label}: ${rowValue(r)}`).join('\n');
}

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
  rows: { pinned?: boolean; /** Dimmed, and changes are ignored. */ locked?: boolean; /** The row has a default: draw a reset button. */ resettable?: boolean; /** It is not at its default (the button is live). */ changed?: boolean; label: string; icon?: string; value?: string; /** A toggle's state. */ on?: boolean; /** A choice's options (all drawn, the chosen one lit) and which is chosen. */ options?: string[]; index?: number; selected: boolean; kind: MenuRow['kind']; space?: boolean; group?: string; exit?: boolean; /** 0..1 along a slider. */ fill?: number }[];
  tabs?: { labels: string[]; active: number };
  /** The selected entry's text, for the pane beside the list. */
  detail?: { title: string; text: string; icon?: string };
  /** True when left/right do something on the selected row. */
  adjustable: boolean;
  /** The selected row is away from its default, so the reset key does something. */
  resettable: boolean;
  /** The hide key is held: the panel is invisible, the world clear. */
  peeking?: boolean;
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
    if (!row || row.locked?.()) return;
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
    if (!row || row.locked?.()) return false;
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

  /** Resets row `i` (or the selected one) to its default. */
  reset(i?: number) {
    if (i !== undefined) this.select(i);
    const top = this.top();
    const row = top?.menu.rows[top.selected];
    return !!row && !row.locked?.() && resetRow(row);
  }

  /** Picks option `opt` of choice row `i` (the mouse clicking one of its options). */
  pick(i: number, opt: number) {
    this.select(i);
    const row = this.top()?.menu.rows[i];
    if (row?.kind !== 'choice' || row.locked?.() || opt < 0 || opt >= row.options.length || opt === row.get()) return false;
    row.set(opt);
    return true;
  }

  /** Sets a slider row to a place along it, 0..1 (the mouse clicking or dragging the track). */
  slide(i: number, fraction: number) {
    this.select(i);
    const top = this.top();
    const row = top?.menu.rows[i];
    if (row?.kind !== 'slider' || row.locked?.()) return false;
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
      detail: sel?.kind === 'entry' ? { title: sel.label, text: sel.detail, icon: sel.icon } : undefined,
      adjustable: (sel?.kind === 'slider' || sel?.kind === 'choice' || sel?.kind === 'toggle') && !sel.locked?.(),
      resettable: !!sel && !rowIsDefault(sel) && !sel.locked?.(),
      rows: top.menu.rows.map((r, i) => ({
        label: r.label,
        pinned: r.pinned,
        locked: r.locked?.() || undefined,
        resettable: r.def !== undefined,
        changed: !rowIsDefault(r),
        icon: r.kind === 'entry' ? r.icon : undefined,
        kind: r.kind,
        space: r.space,
        group: r.group,
        exit: r.kind === 'action' ? r.exit : undefined,
        fill: r.kind === 'slider' ? (r.get() - r.min) / (r.max - r.min) : undefined,
        value: r.kind === 'toggle' || r.kind === 'choice' ? undefined : rowValue(r),
        on: r.kind === 'toggle' ? r.get() : undefined,
        options: r.kind === 'choice' ? r.options : undefined,
        index: r.kind === 'choice' ? r.get() : undefined,
        selected: i === top.selected,
      })),
    };
  }

  private top() {
    return this.stack[this.stack.length - 1];
  }
}
