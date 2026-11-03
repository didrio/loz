/**
 * A stack of menus with up/down selection: the dev menu, the pause menu, and the main menu
 * later. Pure logic (no DOM, no input devices): the game feeds it "up / down / confirm /
 * back" from the keyboard, gamepad or mouse, and the HUD draws `view()`.
 */

export type MenuRow =
  /** Runs `run` when chosen. */
  | { kind: 'action'; label: string; run: () => void }
  /** On/off; choosing it flips it and the menu stays open. */
  | { kind: 'toggle'; label: string; get: () => boolean; set: (on: boolean) => void }
  /** Opens a deeper menu (built fresh each time it's opened). */
  | { kind: 'submenu'; label: string; menu: () => Menu };

export interface Menu {
  title: string;
  /** Text shown under the title (a note to read, or what to do when there are no rows). */
  body?: string;
  rows: MenuRow[];
}

/** What the HUD draws. */
export interface MenuView {
  title: string;
  body?: string;
  rows: { label: string; value?: string; selected: boolean }[];
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
    else this.stack.push({ menu: row.menu(), selected: 0 });
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
    return {
      title: top.menu.title,
      body: top.menu.body,
      rows: top.menu.rows.map((r, i) => ({
        label: r.label,
        value: r.kind === 'toggle' ? (r.get() ? 'ON' : 'OFF') : r.kind === 'submenu' ? '›' : undefined,
        selected: i === top.selected,
      })),
    };
  }

  private top() {
    return this.stack[this.stack.length - 1];
  }
}
