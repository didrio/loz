import type { Sfx } from '../core/audio';
import type { Hud } from '../ui/hud';
import type { Page } from './script';

/** Pages of dialog shown one at a time; `show` resolves once the last page is dismissed. */
export class Dialog {
  private pages: Page[] = [];
  private resolve: ((choice: number) => void) | null = null;
  private fresh = false;
  /** A choice list shown under the last page (a yes/no question), and which one is highlighted. */
  private options: string[] | null = null;
  private selected = 0;
  /** Index of the back-out option (shown red; Cancel picks it), or -1. */
  private exit = -1;

  constructor(private hud: Hud, private sfx: Sfx) {}

  get open() {
    return this.resolve !== null;
  }

  /**
   * Shows the pages. With `options`, the last page ends in a choice list and this resolves
   * with the index picked (0 when there are none).
   */
  show(pages: Page[], options?: string[], exit = -1) {
    this.exit = options?.length ? exit : -1;
    this.pages = pages.slice();
    this.options = options?.length ? options : null;
    this.selected = 0;
    this.fresh = true;
    this.hud.openDialog(this.pages[0].who ?? '', this.pages[0].text);
    return new Promise<number>((resolve) => (this.resolve = resolve));
  }

  /** The mouse over a row of the open question. */
  hover(i: number) {
    if (this.asking && i !== this.selected && i >= 0 && i < this.options!.length) {
      this.selected = i;
      this.sfx.select();
      this.hud.setChoices(this.options, i, this.exit);
    }
  }

  /** The mouse clicking a row of the open question: picks it. */
  click(i: number) {
    if (!this.asking || i < 0 || i >= this.options!.length) return;
    this.selected = i;
    this.update(true);
  }

  private get asking() {
    return !!this.options && this.pages.length === 1 && this.hud.dialogDone && !this.fresh;
  }

  /** Call every frame with whether "confirm" was pressed, and a menu step (-1 up, 1 down, 0 none). */
  update(confirm: boolean, step = 0, cancel = false) {
    if (!this.open) return;
    // Ignore the press that opened the dialog (e.g. the same "interact" key).
    if (this.fresh) {
      this.fresh = false;
      return;
    }
    if (this.asking) {
      if (step !== 0) {
        this.selected = (this.selected + step + this.options!.length) % this.options!.length;
        this.sfx.select();
      }
      this.hud.setChoices(this.options, this.selected, this.exit);
      if (cancel && this.exit >= 0) {
        this.selected = this.exit;
        confirm = true;
      }
    }
    if (!confirm) return;
    if (!this.hud.dialogDone) {
      this.hud.finishTyping();
      return;
    }
    if (this.options && this.pages.length === 1) {
      this.hud.closeDialog();
      this.hud.setChoices(null);
      const r = this.resolve!;
      this.resolve = null;
      r(this.selected);
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
    r(0);
  }
}
