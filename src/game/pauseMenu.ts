import { foundHints } from '../content/hints';
import { foundSigils } from '../content/sigils';
import type { Game } from './game';
import type { Menu } from './menu';
import { MenuDriver } from './menuDriver';

/**
 * The pause menu (P / Start): stops the game and, for now, offers the keepers' notes and the
 * messages (sigils) Wren has found (choose one to read it). More pages (gear, settings) go in as rows of the root later.
 * P / Start close it from any depth; B / Backspace / Esc go back a page, and out of the first.
 */
export class PauseMenu {
  readonly menu: MenuDriver;

  constructor(private readonly game: Game) {
    this.menu = new MenuDriver(game);
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /**
   * One frame of input. Returns true while the menu is open, and on the frame it closes, so
   * the press that closed it doesn't also reach the game (Start is also "confirm").
   */
  update(): boolean {
    const { input } = this.game;
    if (!this.menu.isOpen) {
      if (this.game.mode !== 'play' || !input.pressed('pause')) return false;
      this.menu.open(this.root());
    } else if (input.pressed('pause')) {
      this.menu.close();
    } else {
      this.menu.update();
    }
    return true;
  }

  private root(): Menu {
    const { state } = this.game;
    const rows: Menu['rows'] = [{ kind: 'submenu', label: 'Keepers\' notes', menu: () => this.notes() }];
    if (foundSigils(state).length) rows.push({ kind: 'submenu', label: 'Messages', menu: () => this.messages() });
    return { title: 'Paused', rows };
  }

  private notes(): Menu {
    const notes = foundHints(this.game.state);
    if (!notes.length) {
      return { title: 'Keepers\' notes', body: 'No notes yet. The keepers hid a few around the valley, for anyone patient enough to find them.', rows: [] };
    }
    return {
      title: 'Keepers\' notes',
      rows: notes.map((h) => ({ kind: 'submenu' as const, label: h.title, menu: () => ({ title: h.title, body: h.text.replace(/\*/g, ''), rows: [] }) })),
    };
  }

  /** The sigils Wren has read, in the order they were written. */
  private messages(): Menu {
    return {
      title: 'Messages',
      rows: foundSigils(this.game.state).map((g) => ({ kind: 'submenu' as const, label: g.title, menu: () => ({ title: g.title, body: g.text, rows: [] }) })),
    };
  }
}
