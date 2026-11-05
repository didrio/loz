import type { Sfx } from '../core/audio';
import { DELIVERIES, speak, type DeliveryName } from '../core/speech/voice';
import type { VoiceHandle } from '../core/speech/play';
import type { Timeline } from '../core/speech/prosody';
import { speakerFor } from '../content/voices';
import type { Hud } from '../ui/hud';
import { visibleEnds, visibleText } from '../ui/richText';
import type { Page } from './script';

/**
 * How many raw characters of `text` are shown `t` seconds into a spoken line: each word's letters spread across
 * the word, so the text and the voice match. After the last word the box is complete.
 */
export function revealAt(text: string, timeline: Timeline, t: number): number {
  const ends = visibleEnds(text);
  const plain = visibleText(text);
  const words = timeline.words;
  const last = words[words.length - 1];
  if (!last || t >= last.end) return text.length;
  let i = -1;
  for (let k = 0; k < words.length && words[k].start <= t; k++) i = k;
  if (i < 0) return 0;
  const w = words[i];
  const frac = Math.min(1, Math.max(0, (t - w.start) / Math.max(1e-3, w.end - w.start)));
  let v = Math.floor(w.span[0] + frac * (w.span[1] - w.span[0]));
  if (frac >= 1) while (v < plain.length && plain[v] !== ' ' && plain[v] !== '\n') v++; // its punctuation
  return ends[Math.min(v, ends.length - 1)];
}

/** A page wrapped whole in `[soft]` or `[shake]` is said that way instead of in the speaker's usual delivery. */
function wholePageDelivery(text: string): DeliveryName | null {
  const m = /^\[(soft|shake)\]([\s\S]*)\[\/\]$/.exec(text);
  return m && !m[2].includes('[/]') ? (m[1] as DeliveryName) : null;
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
  /** The line being spoken for the current page. It runs on if the player skips the typing; the next page or the end cuts it. */
  private line: VoiceHandle | null = null;

  constructor(private hud: Hud, private sfx: Sfx, private room: () => 'outdoors' | 'house' | 'dungeon' = () => 'outdoors') {}

  /** Cuts off the line being spoken (a pause, a death, a choice window). */
  cutVoice(fadeMs = 80) {
    this.line?.stop(fadeMs);
    this.line = null;
  }

  /** Opens a page in the box: an NPC's page is spoken and typed along to its voice, any other is typed at the usual pace. */
  private openPage(page: Page) {
    this.cutVoice();
    const speaker = speakerFor(page.who);
    const line = speaker ? this.render(page, speaker) : null;
    this.line = line?.handle ?? null;
    this.hud.openDialog(page.who ?? '', page.text, line ? () => revealAt(page.text, line.timeline, this.sfx.voiceTime(line.handle)) : undefined);
  }

  private render(page: Page, speaker: NonNullable<ReturnType<typeof speakerFor>>) {
    const tagged = wholePageDelivery(page.text);
    const speech = speak(page.text, speaker.voice, tagged ? DELIVERIES[tagged] : speaker.delivery);
    const handle = this.sfx.speak(speech, this.room());
    return handle ? { handle, timeline: speech.timeline } : null;
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
