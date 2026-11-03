import { DEV_STATES, type DevState } from '../content/devStates';
import type { Game } from './game';
import { MenuStack, type Menu } from './menu';

/**
 * The dev menu (~ or L3): toggles for testing and a list of ready-made save states. Only in
 * dev builds, the GitHub Pages test build and ?debug, never the shipped game. Opening it
 * pauses the game; B / Backspace / Esc go back a menu, and out of the first one.
 */
export class DevMenu {
  private readonly stack = new MenuStack();

  constructor(private readonly game: Game, private readonly enabled: () => boolean) {
    const { hud } = game;
    hud.onMenuHover = (i) => this.stack.isOpen && this.stack.select(i);
    hud.onMenuClick = (i) => {
      if (!this.stack.isOpen) return;
      this.stack.select(i);
      this.stack.confirm();
      this.draw();
    };
  }

  get isOpen() {
    return this.stack.isOpen;
  }

  /**
   * One frame of input. Returns true while the menu is open, and on the frame it closes (the
   * game stands still), so the press that chose or closed doesn't also reach the game: Enter
   * is both "choose" here and "interact" there.
   */
  update(): boolean {
    const { input, sfx } = this.game;
    if (!this.stack.isOpen) {
      if (!this.enabled() || this.game.mode !== 'play' || !input.pressed('devMenu')) return false;
      this.stack.open(this.root());
      document.exitPointerLock?.();
      sfx.init();
      sfx.select();
    } else if (input.pressed('devMenu')) {
      this.stack.close();
    } else {
      if (input.pressed('menuUp')) this.step(-1);
      if (input.pressed('menuDown')) this.step(1);
      if (input.pressed('confirm')) this.stack.confirm();
      else if (input.pressed('cancel')) this.stack.back();
    }
    this.draw();
    return true;
  }

  private step(dir: -1 | 1) {
    this.stack.move(dir);
    this.game.sfx.select();
  }

  private draw() {
    this.game.hud.setMenu(this.stack.view());
  }

  private root(): Menu {
    const { player, state } = this.game;
    return {
      title: 'Dev menu',
      rows: [
        { kind: 'toggle', label: 'Dev sprint (x5)', get: () => player.devSpeed !== 1, set: (on) => (player.devSpeed = on ? 5 : 1) },
        { kind: 'toggle', label: 'Invincible', get: () => state.invincible, set: (on) => (state.invincible = on) },
        { kind: 'submenu', label: 'Save states', menu: () => this.statesMenu() },
      ],
    };
  }

  private statesMenu(): Menu {
    return {
      title: 'Save states (replaces your save)',
      rows: DEV_STATES.map((s: DevState) => ({
        kind: 'action' as const,
        label: s.name,
        run: () => {
          this.stack.close();
          this.game.loadDevState(s);
          this.game.hud.showToast(`Loaded: ${s.name}`);
        },
      })),
    };
  }
}
