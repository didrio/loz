import { blipAt, MOODS, type BlipMood, type BlipState, type BlipVoice, type MoodName, type RoomName } from '../core/blips';
import type { Sfx } from '../core/audio';
import { speakerFor } from '../content/voices';
import type { Hud } from '../ui/hud';
import { visibleEnds, visibleText } from '../ui/richText';
import type { Page } from './script';

/** A page wrapped whole in `[soft]` or `[shake]` is said that way. */
function wholePageMood(text: string): BlipMood {
  const m = /^\[(soft|shake)\]([\s\S]*)\[\/\]$/.exec(text);
  return m && !m[2].includes('[/]') ? MOODS[m[1] as MoodName] : {};
}

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
  /** The current page's talk: who (null = silent page), what they say, how far it has typed. */
  private talk: { voice: BlipVoice; plain: string; ends: number[]; mood: BlipMood; state: BlipState; seen: number } | null = null;

  constructor(private hud: Hud, private sfx: Sfx, private room: () => RoomName = () => 'outdoors') {}

  /** Ends the talk (the next page, a choice, a pause, a death): the music comes back up. */
  cutVoice() {
    this.talk = null;
    this.sfx.endTalk?.();
  }

  /** Opens a page in the box. An NPC's page blips as it types (`typed`); any other gets the key-tap. */
  private openPage(page: Page) {
    this.cutVoice();
    const voice = speakerFor(page.who);
    if (voice) {
      this.talk = { voice, plain: visibleText(page.text), ends: visibleEnds(page.text), mood: wholePageMood(page.text), state: { letters: 0 }, seen: 0 };
    }
    this.hud.openDialog(page.who ?? '', page.text, !!voice);
  }

  /** The box has just typed raw characters [from, to) of the page: blip for the new visible ones. Skipping the typing is silent. */
  typed(from: number, to: number) {
    const t = this.talk;
    if (!t) {
      for (let i = from; i < to; i++) if (i % 3 === 0) this.sfx.blip();
      return;
    }
    while (t.seen < t.plain.length && t.ends[t.seen + 1] <= to) {
      const blip = blipAt(t.voice, t.plain, t.seen++, t.state, t.mood);
      if (blip) this.sfx.talk(blip, this.room());
    }
  }

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
    this.openPage(this.pages[0]);
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

  /** A question's choices are showing. */
  get asking() {
    return this.open && !!this.options && this.pages.length === 1 && this.hud.dialogDone && !this.fresh;
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
      this.cutVoice();
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
      this.openPage(this.pages[0]);
      return;
    }
    this.cutVoice();
    this.hud.closeDialog();
    const r = this.resolve!;
    this.resolve = null;
    r(0);
  }
}
