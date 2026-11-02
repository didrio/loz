import type { Sfx } from '../core/audio';
import type { Hud } from '../ui/hud';
import type { Page } from './script';

/** Pages of dialog shown one at a time; `show` resolves once the last page is dismissed. */
export class Dialog {
  private pages: Page[] = [];
  private resolve: (() => void) | null = null;
  private fresh = false;

  constructor(private hud: Hud, private sfx: Sfx) {}

  get open() {
    return this.resolve !== null;
  }

  show(pages: Page[]) {
    this.pages = pages.slice();
    this.fresh = true;
    this.hud.openDialog(this.pages[0].who ?? '', this.pages[0].text);
    return new Promise<void>((resolve) => (this.resolve = resolve));
  }

  /** Call every frame with whether "confirm" was pressed. */
  update(confirm: boolean) {
    if (!this.open) return;
    // Ignore the press that opened the dialog (e.g. the same "interact" key).
    if (this.fresh) {
      this.fresh = false;
      return;
    }
    if (!confirm) return;
    if (!this.hud.dialogDone) {
      this.hud.finishTyping();
      return;
    }
    this.pages.shift();
    if (this.pages.length) {
      this.sfx.select();
      this.hud.openDialog(this.pages[0].who ?? '', this.pages[0].text);
      return;
    }
    this.hud.closeDialog();
    const r = this.resolve!;
    this.resolve = null;
    r();
  }
}
