import type { Action } from '../core/input';
import { MenuStack, type Menu, type MenuView } from './menu';

/** What a menu needs from the game: input, somewhere to draw, a click sound. */
export interface MenuIo {
  input: { pressed(a: Action): boolean; held?(a: Action): boolean };
  hud: { setMenu(view: MenuView | null): void };
  sfx: { init(): void; select(): void };
}

const REPEAT_DELAY = 20;
const REPEAT_EVERY = 3;

/**
 * Drives one `MenuStack` from the player's input and draws it: up/down move (with a tick),
 * confirm chooses, cancel goes back (and out of the first menu). The dev menu and script
 * menus (`ChoiceMenu`) share it, and the pause menu should too. The mouse comes in through
 * `hover`/`click` (the game routes the HUD's events to whichever menu is open).
 */
export class MenuDriver {
  readonly stack = new MenuStack();
  /** Set by a tabbed menu: called with -1 / +1 when the player presses the tab buttons. */
  onTab: ((dir: -1 | 1) => void) | null = null;
  /** Frames a left/right button has been held, for repeating (sliders). */
  private held = 0;

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

  /** Shows another menu in place of this one (a tab change). */
  replace(menu: Menu) {
    this.stack.replace(menu);
    this.io.sfx.select();
    this.draw();
  }

  close() {
    this.stack.close();
    this.draw();
  }

  /** The mouse on a slider's arrows. */
  adjust(i: number, dir: -1 | 1) {
    if (this.stack.adjust(dir, i)) this.io.sfx.select();
    this.draw();
  }

  /** The mouse clicking or dragging a slider's track (0..1). */
  slide(i: number, fraction: number) {
    if (this.stack.slide(i, fraction)) this.io.sfx.select();
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
    this.updateAdjust();
    // The tab buttons share keys with confirm (E), so they win.
    const tab = input.pressed('tabPrev') ? -1 : input.pressed('tabNext') ? 1 : 0;
    if (tab && this.onTab) this.onTab(tab);
    else if (input.pressed('confirm')) this.stack.confirm();
    else if (input.pressed('cancel')) this.stack.back();
    this.draw();
  }

  /** Left/right: one step per press, then repeating while held (a slider takes many steps). */
  private updateAdjust() {
    const { input, sfx } = this.io;
    const pressed = input.pressed('menuLeft') ? -1 : input.pressed('menuRight') ? 1 : 0;
    const held = input.held?.('menuLeft') ? -1 : input.held?.('menuRight') ? 1 : 0;
    let step = 0;
    if (pressed) {
      this.held = 0;
      step = pressed;
    } else if (held) {
      this.held++;
      if (this.held >= REPEAT_DELAY && (this.held - REPEAT_DELAY) % REPEAT_EVERY === 0) step = held;
    } else this.held = 0;
    if (step && this.stack.adjust(step as -1 | 1)) sfx.select();
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

  ask(title: string, options: string[], exit?: number): Promise<number | null> {
    this.finish(null); // never leave an earlier question hanging
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.driver.open({ title, rows: options.map((label, i) => ({ kind: 'action' as const, label, run: () => this.finish(i), exit: i === exit })), compact: true });
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
