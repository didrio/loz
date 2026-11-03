import { DEV_STATES, type DevState } from '../content/devStates';
import type { Game } from './game';
import type { Menu } from './menu';
import { MenuDriver } from './menuDriver';
import { TRIAL_RULES } from './trialFalls';

/**
 * The dev menu (~ or L3): toggles for testing and a list of ready-made save states. Only in
 * dev builds, the GitHub Pages test build and ?debug, never the shipped game. Opening it
 * pauses the game; B / Backspace / Esc go back a menu, and out of the first one.
 */
export class DevMenu {
  readonly menu: MenuDriver;

  constructor(private readonly game: Game, private readonly enabled: () => boolean) {
    this.menu = new MenuDriver(game);
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /**
   * One frame of input. Returns true while the menu is open, and on the frame it closes (the
   * game stands still), so the press that chose or closed doesn't also reach the game: Enter
   * is both "choose" here and "interact" there.
   */
  update(): boolean {
    const { input } = this.game;
    if (!this.menu.isOpen) {
      if (!this.enabled() || this.game.mode !== 'play' || !input.pressed('devMenu')) return false;
      this.menu.open(this.root());
    } else if (input.pressed('devMenu')) {
      this.menu.close();
    } else {
      this.menu.update();
    }
    return true;
  }

  private root(): Menu {
    const { player, state } = this.game;
    return {
      title: 'Dev menu',
      rows: [
        { kind: 'toggle', label: 'Dev sprint (x5)', get: () => player.devSpeed !== 1, set: (on) => (player.devSpeed = on ? 5 : 1) },
        { kind: 'toggle', label: 'Invincible', get: () => state.invincible, set: (on) => (state.invincible = on) },
        { kind: 'toggle', label: 'Trial falls cost a half heart', get: () => TRIAL_RULES.fallDamage > 0, set: (on) => (TRIAL_RULES.fallDamage = on ? 1 : 0) },
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
          this.menu.close();
          this.game.loadDevState(s);
          this.game.hud.showToast(`Loaded: ${s.name}`);
        },
      })),
    };
  }
}
