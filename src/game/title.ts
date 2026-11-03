import type * as THREE from 'three';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import type { Hud } from '../ui/hud';
import type { GameState } from './state';

type MenuItem = 'continue' | 'new' | 'confirmNew';
const MENU_LABELS: Record<MenuItem, string> = { continue: 'Continue', new: 'New Game', confirmNew: 'Start over? This erases your save' };

/**
 * The title screen: a slow camera orbit over the valley at a drifting morning hour, and
 * the menu. New Game over an existing save asks once more before it erases anything.
 */
export class TitleMenu {
  private t = 0;
  private items: MenuItem[];
  private selected = 0;

  constructor(private readonly hud: Hud, private readonly sfx: Sfx, hasSave: boolean) {
    this.items = hasSave ? ['continue', 'new'] : ['new'];
    this.render();
  }

  /** One frame: moves the camera and the menu; returns the choice on the frame it's confirmed. */
  update(dt: number, input: Input, camera: THREE.PerspectiveCamera, state: GameState): 'continue' | 'new' | null {
    this.t += dt;
    state.hours = 7.5 + Math.sin(this.t * 0.05) * 1.5;
    const a = this.t * 0.04;
    camera.position.set(Math.cos(a) * 70, 32, Math.sin(a) * 70);
    camera.lookAt(0, 4, 0);

    if (input.pressed('menuUp') || input.pressed('menuDown')) {
      this.selected = (this.selected + (input.pressed('menuUp') ? -1 : 1) + this.items.length) % this.items.length;
      if (this.items.includes('confirmNew')) this.items = this.items.map((i) => (i === 'confirmNew' ? 'new' : i));
      this.sfx.init();
      this.sfx.select();
      this.render();
    }
    if (!input.pressed('confirm')) return null;
    this.sfx.init();
    const choice = this.items[this.selected];
    if (choice === 'new' && this.items.includes('continue')) {
      this.items[this.selected] = 'confirmNew';
      this.sfx.select();
      this.render();
      return null;
    }
    return choice === 'continue' ? 'continue' : 'new';
  }

  private render() {
    this.hud.setTitleMenu(this.items.map((i) => MENU_LABELS[i]), this.selected);
  }
}
