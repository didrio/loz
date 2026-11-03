import type { Action } from '../core/input';
import { MenuStack, type Menu, type MenuView } from './menu';

/** What a menu needs from the game: input, somewhere to draw, a click sound. */
export interface MenuIo {
  input: { pressed(a: Action): boolean };
  hud: { setMenu(view: MenuView | null): void };
  sfx: { init(): void; select(): void };
}

/**
 * Drives one `MenuStack` from the player's input and draws it: up/down move (with a tick),
 * confirm chooses, cancel goes back (and out of the first menu). The dev menu and script
 * menus (`ChoiceMenu`) share it, and the pause menu should too. The mouse comes in through
 * `hover`/`click` (the game routes the HUD's events to whichever menu is open).
 */
export class MenuDriver {
  readonly stack = new MenuStack();

  constructor(private readonly io: MenuIo) {}

  get isOpen() {
    return this.stack.isOpen;
  }

  open(menu: Menu) {
    this.stack.open(menu);
    globalThis.document?.exitPointerLock?.();
    this.io.sfx.init();
    this.io.sfx.select();
    this.draw();
  }

  close() {
    this.stack.close();
    this.draw();
  }

  hover(i: number) {
    this.stack.select(i);
    this.draw();
  }

  click(i: number) {
    this.stack.select(i);
    this.stack.confirm();
    this.draw();
  }

  /** One frame of keyboard / gamepad input. */
  update() {
    const { input, sfx } = this.io;
    for (const [action, dir] of [['menuUp', -1], ['menuDown', 1]] as const) {
      if (!input.pressed(action)) continue;
      this.stack.move(dir);
      sfx.select();
    }
    if (input.pressed('confirm')) this.stack.confirm();
    else if (input.pressed('cancel')) this.stack.back();
    this.draw();
  }

  private draw() {
    this.io.hud.setMenu(this.stack.view());
  }
}

/**
 * A one-question menu for scripts (`ScriptApi.choose`): a titled list of options that
 * resolves with the index chosen, or null if the player backs out. Unlike `ask`, it's a
 * panel of its own rather than a line under a dialog page, so it holds long lists (the
 * bells' fast-travel menu).
 */
export class ChoiceMenu {
  readonly driver: MenuDriver;
  private resolve: ((choice: number | null) => void) | null = null;

  constructor(io: MenuIo) {
    this.driver = new MenuDriver(io);
  }

  get isOpen() {
    return this.driver.isOpen;
  }

  ask(title: string, options: string[]): Promise<number | null> {
    this.finish(null); // never leave an earlier question hanging
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.driver.open({ title, rows: options.map((label, i) => ({ kind: 'action' as const, label, run: () => this.finish(i) })) });
    });
  }

  /** One frame of input (the game calls this instead of the dialog's while it's open). */
  update() {
    this.driver.update();
    if (!this.driver.isOpen) this.finish(null); // backed out of it
  }

  private finish(choice: number | null) {
    const done = this.resolve;
    this.resolve = null;
    if (this.driver.isOpen) this.driver.close();
    done?.(choice);
  }
}
