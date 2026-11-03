import { ACTIONS, glyph, type Action, type Device } from '../core/input';
import { POTIONS } from '../game/flasks';
import type { MenuView } from '../game/menu';
import { KEY_HEX, type KeyColor, type Potion } from '../world/dungeon/format';

/** A little corked bottle in a potion's color (a pale glass one when empty). */
const bottle = (color: string) => `<svg class="bottle" viewBox="0 0 16 22" width="16" height="22" aria-hidden="true">
  <rect x="5.5" y="1" width="5" height="3" rx="1" fill="#8a5a2b" stroke="#2a1a0a" stroke-width="1"/>
  <path d="M6 4 V8 Q2 10 2 14 V18 Q2 21 5 21 H11 Q14 21 14 18 V14 Q14 10 10 8 V4 Z" fill="${color}" stroke="#2a1a0a" stroke-width="1.2"/>
  <path d="M4.5 13 Q5 10.5 7 10" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/></svg>`;

/** The Tether Glove: a leather glove with a coil of glowing cord at the cuff. */
const gloveIcon = `<svg class="glove" viewBox="0 0 18 22" width="18" height="22" aria-hidden="true">
  <path d="M4 21 V11 Q4 9 5.5 9 V4 Q5.5 2.5 7 2.5 Q8.5 2.5 8.5 4 V3 Q8.5 1.5 10 1.5 Q11.5 1.5 11.5 3 V4.5 Q11.5 3.5 13 3.5 Q14.5 3.5 14.5 5 V14 Q14.5 18 12 21 Z" fill="#8a5a2b" stroke="#2a1a0a" stroke-width="1.2"/>
  <path d="M5 9 Q2 10 2.5 13 L4 14" fill="#8a5a2b" stroke="#2a1a0a" stroke-width="1.1"/>
  <path d="M4 18 Q9 15 14 18" fill="none" stroke="#7ff7e8" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// The key icons, drawn as tiny SVGs (a ring bow, a shaft and teeth) so they stay crisp at
// any size. The dark outline is a wider copy of the same shape underneath.
const KEY_SHAPE = `
  <circle cx="7" cy="8" r="4.6" fill="none" stroke-width="3"/>
  <path d="M11.5 8 H25 M20 8 V12.5 M24 8 V11.5" fill="none" stroke-width="3" stroke-linecap="square"/>`;
const keyIcon = (cls: string, color: string, label = '') => `<svg class="${cls}" viewBox="0 0 28 16" width="28" height="16" ${label ? `aria-label="${label}"` : 'aria-hidden="true"'}>
  <g stroke="#3a2608" transform="translate(0 0.8)">${KEY_SHAPE.replace(/stroke-width="3"/g, 'stroke-width="5"')}</g>
  <g stroke="${color}">${KEY_SHAPE}</g></svg>`;
const SMALL_KEY_SVG = keyIcon('key-icon', '#f1c24a');
const hexCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const BOSS_SHAPE = `
  <circle cx="9" cy="10" r="6.2" fill="none" stroke-width="3.4"/>
  <circle cx="9" cy="10" r="1.8" stroke="none" fill="currentColor"/>
  <path d="M9 1.5 V3.8 M9 16.2 V18.5 M0.5 10 H2.8" fill="none" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M15.2 10 H34 M27 10 V15.5 M31.5 10 V14 M22.5 10 V13" fill="none" stroke-width="3.4" stroke-linecap="square"/>`;
const BOSS_KEY_SVG = `<svg class="boss-key hidden" viewBox="0 0 36 20" width="36" height="20" aria-label="Boss Key">
  <g stroke="#3a2608" color="#3a2608" transform="translate(0 0.8)">${BOSS_SHAPE.replace(/stroke-width="3.4"/g, 'stroke-width="5.4"').replace(/stroke-width="2.6"/g, 'stroke-width="4.4"')}</g>
  <g stroke="#ffd76a" color="#ffd76a">${BOSS_SHAPE}</g></svg>`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** All on-screen UI, as plain DOM over the canvas. Holds no game rules. */
export class Hud {
  private el = document.getElementById('hud')!;
  private hearts: HTMLElement;
  private guard: HTMLElement;
  private bars: HTMLElement[];
  private guardFlashT = 0;
  private gems: HTMLElement;
  private keys: HTMLElement;
  private heldKeys = '';
  private drinks: HTMLElement;
  private drinksHtml = '';
  private prompt: HTMLElement;
  private promptLabel = '';
  private clock: HTMLElement;
  private clockIcon: HTMLElement;
  private actions: HTMLElement;
  private area: HTMLElement;
  private dialog: HTMLElement;
  private dialogWho: HTMLElement;
  private dialogText: HTMLElement;
  private dialogChoices: HTMLElement;
  private card: HTMLElement;
  private title: HTMLElement;
  private menu: HTMLElement;
  private fade: HTMLElement;
  private toast: HTMLElement;
  private debug: HTMLElement;
  private gmenu: HTMLElement;
  private gmenuHtml = '';
  /** Set by the game: the mouse hovered a row / clicked a row of the open menu. */
  onMenuHover: (i: number) => void = () => {};
  onMenuClick: (i: number) => void = () => {};
  private bossTitle: HTMLElement;
  private bossBar: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private bossTitleTimer = 0;
  private bossLagValue = 1;
  private device: Device = 'keyboard';
  private typing = { full: '', shown: 0 };
  private areaTimer = 0;
  private toastTimer = 0;
  private lastActions: [Action, string][] = [];
  private lastActionsHtml = '';

  constructor() {
    this.el.innerHTML = `
      <div class="hud-top-left">
        <div class="hearts"></div>
        <div class="gems"><span class="gem-icon"></span><span class="gem-count">0</span></div>
        <div class="keys hidden">${SMALL_KEY_SVG}<span class="key-count">×0</span><span class="color-keys"></span>${BOSS_KEY_SVG}</div>
        <div class="drinks"></div>
      </div>
      <div class="hud-top-right">
        <div class="clock"><div class="clock-icon"></div></div>
        <div class="clock-text"></div>
      </div>
      <div class="actions"></div>
      <div class="prompt"></div>
      <div class="guard-gauge">${'<span class="bar"><span class="bar-fill"></span></span>'.repeat(3)}</div>
      <div class="area"></div>
      <div class="boss-title"><div class="boss-title-name"></div><div class="boss-title-sub"></div></div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div><div class="boss-mark"></div></div></div>
      <div class="toast"></div>
      <div class="dialog hidden"><div class="dialog-who"></div><div class="dialog-text"></div><div class="dialog-choices"></div><div class="dialog-next">▼</div></div>
      <div class="fade"></div>
      <div class="card hidden"></div>
      <div class="title">
        <div class="logo">EMBERVALE</div>
        <div class="subtitle">~ Song of the Waking Shrine ~</div>
        <div class="menu"></div>
        <div class="controls">
          <div><b>WASD</b> move</div><div><b>Mouse</b> camera (click to capture) · <b>←→↑↓</b> also</div>
          <div><b>Click / J</b> sword</div><div><b>Shift / Right-click</b> shield</div>
          <div><b>Space</b> jump</div><div><b>Q</b> lock on / center camera</div>
          <div><b>E</b> talk · open · read</div><div><b>P</b> music on/off</div>
          <div class="pad-note">Gamepads work too.</div>
        </div>
      </div>
      <div class="gmenu hidden"></div>
      <div class="debug hidden"></div>`;
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    this.hearts = q('.hearts');
    this.guard = q('.guard-gauge');
    this.bars = Array.from(this.guard.querySelectorAll<HTMLElement>('.bar-fill'));
    this.gems = q('.gem-count');
    this.keys = q('.keys');
    this.drinks = q('.drinks');
    this.prompt = q('.prompt');
    this.clock = q('.clock-text');
    this.clockIcon = q('.clock-icon');
    this.actions = q('.actions');
    this.area = q('.area');
    this.dialog = q('.dialog');
    this.dialogWho = q('.dialog-who');
    this.dialogText = q('.dialog-text');
    this.dialogChoices = q('.dialog-choices');
    this.card = q('.card');
    this.title = q('.title');
    this.menu = q('.menu');
    this.fade = q('.fade');
    this.toast = q('.toast');
    this.debug = q('.debug');
    this.gmenu = q('.gmenu');
    const rowOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    this.gmenu.addEventListener('mouseover', (e) => {
      const r = rowOf(e);
      if (r) this.onMenuHover(Number(r.dataset.row));
    });
    this.gmenu.addEventListener('click', (e) => {
      const r = rowOf(e);
      if (r) this.onMenuClick(Number(r.dataset.row));
    });
    this.bossTitle = q('.boss-title');
    this.bossBar = q('.boss-bar');
    this.bossFill = q('.boss-fill');
    this.bossLag = q('.boss-lag');
  }

  // --- text formatting ------------------------------------------------------------

  private key(a: Action) {
    return `<span class="key">${escape(glyph(a, this.device))}</span>`;
  }

  /** `*em*`, `[action]` buttons, newlines. */
  private format(text: string) {
    return escape(text)
      .replace(/\[(\w+)\]/g, (m, a) => ((ACTIONS as string[]).includes(a) ? this.key(a as Action) : m))
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  /** Re-renders everything that shows button glyphs when the player switches device. */
  setDevice(d: Device) {
    if (d === this.device) return;
    this.device = d;
    this.el.classList.toggle('gamepad', d === 'gamepad');
    this.renderTyping();
    this.lastActionsHtml = '';
    this.setActions(this.lastActions);
    this.promptLabel = '';
    this.drinksHtml = '';
  }

  // --- status ---------------------------------------------------------------------

  hideTitle() {
    this.title.classList.add('gone');
    this.el.classList.add('playing');
  }

  setTitleMenu(items: string[], selected: number) {
    this.menu.innerHTML = items
      .map((it, i) => `<div class="menu-item${i === selected ? ' selected' : ''}">${escape(it)}</div>`)
      .join('');
  }

  /** Draws the open menu (see game/menu.ts), or hides it when null. */
  setMenu(view: MenuView | null) {
    this.gmenu.classList.toggle('hidden', !view);
    const html = view
      ? `<div class="gmenu-panel"><div class="gmenu-title">${escape(view.title)}</div>${view.rows
          .map((r, i) => `<div class="gmenu-row${r.selected ? ' selected' : ''}" data-row="${i}"><span>${escape(r.label)}</span><span class="gmenu-value">${escape(r.value ?? '')}</span></div>`)
          .join('')}<div class="gmenu-help">${this.key('menuUp')}${this.key('menuDown')} move · ${this.key('confirm')} choose · ${this.key('cancel')} back</div></div>`
      : '';
    if (html !== this.gmenuHtml) this.gmenu.innerHTML = this.gmenuHtml = html;
  }

  setHearts(hp: number, max: number) {
    let html = '';
    for (let i = 0; i < max / 2; i++) {
      const v = hp - i * 2;
      html += `<span class="heart ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}">♥</span>`;
    }
    if (this.hearts.innerHTML !== html) this.hearts.innerHTML = html;
    this.hearts.classList.toggle('low', hp <= 2);
  }

  /**
   * The guard gauge that floats beside Wren: one bar per slot (`fills`, 1 = up), green while
   * up or recovering; the recovering bars turn red while `paused` (shield up, so they wait),
   * and the whole gauge while broken. `at` is its screen position, or null to hide it.
   */
  setGuard(fills: number[], broken: number, paused: boolean, at: { x: number; y: number } | null) {
    this.guard.classList.toggle('show', !!at);
    if (!at) return;
    this.guard.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%)`;
    fills.forEach((f, i) => {
      const el = this.bars[i];
      const h = `${Math.round(f * 100)}%`;
      if (el.style.height !== h) el.style.height = h;
      el.parentElement!.classList.toggle('up', f >= 1);
      el.parentElement!.classList.toggle('paused', paused && f < 1);
    });
    this.guard.classList.toggle('broken', broken > 0);
  }

  /** Shakes the guard gauge (the guard just broke). */
  flashGuard() {
    this.guard.classList.remove('flash');
    void this.guard.offsetWidth; // restart the animation
    this.guard.classList.add('flash');
    this.guardFlashT = 0.5;
  }

  setGems(n: number) {
    const s = String(n);
    if (this.gems.textContent !== s) this.gems.textContent = s;
  }

  /**
   * Plain small keys usable here (the field's), the dungeon's colored keys held, and its boss
   * key if held; hidden when there are none.
   */
  setKeys(n: number, colors: readonly KeyColor[], bossKey = false) {
    this.keys.classList.toggle('hidden', n <= 0 && !colors.length && !bossKey);
    this.keys.querySelector('.key-icon')!.classList.toggle('hidden', n <= 0);
    const count = this.keys.querySelector('.key-count')!;
    count.classList.toggle('hidden', n <= 0);
    const s = `×${n}`;
    if (count.textContent !== s) count.textContent = s;
    const held = colors.join(',');
    if (held !== this.heldKeys) {
      this.heldKeys = held;
      this.keys.querySelector('.color-keys')!.innerHTML = colors.map((c) => keyIcon('color-key', hexCss(KEY_HEX[c]), `${c} key`)).join('');
    }
    this.keys.querySelector('.boss-key')!.classList.toggle('hidden', !bossKey);
  }

  /**
   * The glove (once held) and the flasks Wren owns: a bottle each in its potion's color, or
   * an empty one, with its button. `boost`: how much of an attack potion is left (0–1),
   * shown under the item row while it lasts.
   */
  setFlasks(slots: readonly (Potion | null)[], boost: number, glove = false) {
    const item = glove ? `<div class="drink" title="Tether Glove">${gloveIcon}${this.key('item')}</div>` : '';
    const bar = boost > 0 ? `<span class="boost"><span style="width:${Math.round(boost * 100)}%"></span></span>` : '';
    const html = item + slots.map((p, i) => {
      const action: Action = i === 0 ? 'flask1' : 'flask2';
      const title = p ? POTIONS[p].name : 'Empty flask';
      return `<div class="drink${p ? '' : ' empty'}" title="${escape(title)}">${bottle(p ? POTIONS[p].color : 'rgba(205, 230, 238, 0.35)')}${this.key(action)}</div>`;
    }).join('') + bar;
    if (html === this.drinksHtml) return;
    this.drinksHtml = html;
    this.drinks.innerHTML = html;
  }

  /**
   * The interact prompt that floats over something in reach: its button and what it does
   * ("E Talk"), at a screen position, or null to hide it.
   */
  setPrompt(p: { x: number; y: number; label: string } | null) {
    this.prompt.classList.toggle('show', !!p);
    if (!p) return;
    this.prompt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    if (p.label !== this.promptLabel) {
      this.promptLabel = p.label;
      this.prompt.innerHTML = `${this.key('interact')}<span>${escape(p.label)}</span>`;
    }
  }

  setClock(hours: number, day: number) {
    const h = Math.floor(hours), m = Math.floor(((hours % 1) * 60) / 10) * 10;
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const s = `Day ${day} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    if (this.clock.textContent !== s) this.clock.textContent = s;
    this.clockIcon.style.transform = `rotate(${(hours / 24) * 360 + 180}deg)`;
  }

  /** Context hints in the corner, e.g. [['interact', 'Talk'], ['lock', 'Lock on']]. */
  setActions(list: [Action, string][]) {
    this.lastActions = list;
    const html = list.map(([a, label]) => `<div class="action">${this.key(a)}${escape(label)}</div>`).join('');
    if (html === this.lastActionsHtml) return;
    this.lastActionsHtml = html;
    this.actions.innerHTML = html;
  }

  showArea(name: string) {
    if (this.bossTitleTimer > 0) return; // a boss's name card has the stage
    this.area.innerHTML = `<span class="line"></span>${escape(name)}<span class="line"></span>`;
    this.area.classList.add('show');
    this.areaTimer = 3.2;
  }

  /** A short note at the bottom of the screen (formatted like dialog: `[action]` shows its button). */
  showToast(text: string) {
    this.toast.innerHTML = this.format(text);
    this.toast.classList.add('show');
    this.toastTimer = 2.5;
  }

  /** The big name card when a boss appears. */
  showBossTitle(name: string, epithet: string) {
    this.bossTitle.querySelector('.boss-title-name')!.textContent = name;
    this.bossTitle.querySelector('.boss-title-sub')!.textContent = epithet;
    this.bossTitle.classList.add('show');
    this.bossTitleTimer = 3.6;
    this.area.classList.remove('show');
    this.areaTimer = 0;
  }

  /** Boss health bar: pass null to hide. `marks` are phase thresholds (fractions). */
  setBoss(boss: { name: string; hp: number; maxHp: number; marks: number[] } | null) {
    this.bossBar.classList.toggle('hidden', !boss);
    if (!boss) {
      this.bossLagValue = 1;
      return;
    }
    const v = Math.max(0, boss.hp / boss.maxHp);
    this.bossBar.querySelector('.boss-name')!.textContent = boss.name;
    this.bossFill.style.width = `${v * 100}%`;
    this.bossLag.style.width = `${Math.max(v, this.bossLagValue) * 100}%`;
    const mark = this.bossBar.querySelector<HTMLElement>('.boss-mark')!;
    mark.style.left = `${(boss.marks[0] ?? -1) * 100}%`;
    mark.style.display = boss.marks.length ? '' : 'none';
    this.bossLagValue = Math.max(v, this.bossLagValue - 0.004);
  }

  setDebug(text: string | null) {
    this.debug.classList.toggle('hidden', text === null);
    if (text !== null) this.debug.textContent = text;
  }

  // --- dialog ---------------------------------------------------------------------

  openDialog(who: string, text: string) {
    this.dialog.classList.remove('hidden');
    this.dialogWho.textContent = who;
    this.dialogWho.style.display = who ? '' : 'none';
    this.typing = { full: text, shown: 0 };
    this.dialogText.innerHTML = '';
    this.dialog.classList.remove('done');
  }

  closeDialog() {
    this.dialog.classList.add('hidden');
    this.setChoices(null);
  }

  /** The choice list under the dialog text (a question), with one highlighted; null hides it. */
  setChoices(options: string[] | null, selected = 0) {
    this.dialogChoices.innerHTML = options
      ? options.map((o, i) => `<span class="dialog-choice${i === selected ? ' selected' : ''}">${escape(o)}</span>`).join('')
      : '';
  }

  /** True once the current page has finished typing. */
  get dialogDone() {
    return this.typing.shown >= this.typing.full.length;
  }

  finishTyping() {
    this.typing.shown = this.typing.full.length;
    this.renderTyping();
  }

  private renderTyping() {
    // Type out the raw text, but never cut a markup token like [attack] in half.
    let cut = Math.floor(this.typing.shown);
    const open = this.typing.full.slice(0, cut).search(/[{[][^}\]]*$/);
    if (open !== -1) cut = open;
    let shown = this.typing.full.slice(0, cut);
    if ((shown.match(/\*/g)?.length ?? 0) % 2 === 1) shown += '*'; // highlight while it types
    this.dialogText.innerHTML = this.format(shown);
    this.dialog.classList.toggle('done', this.dialogDone);
  }

  // --- full screen ----------------------------------------------------------------

  showCard(title: string, sub: string) {
    this.card.innerHTML = `<div class="card-title">${escape(title)}</div><div class="card-sub">${this.format(sub)}</div><div class="press">Press ${this.key('confirm')}</div>`;
    this.card.classList.remove('hidden');
  }

  hideCard() {
    this.card.classList.add('hidden');
  }

  setFade(v: number) {
    this.fade.style.opacity = String(v);
  }

  update(dt: number, typeBlip: () => void) {
    if (!this.dialog.classList.contains('hidden') && !this.dialogDone) {
      const before = Math.floor(this.typing.shown);
      this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + dt * 55);
      if (Math.floor(this.typing.shown) !== before) {
        if (before % 3 === 0) typeBlip();
        this.renderTyping();
      }
    }
    if (this.areaTimer > 0) {
      this.areaTimer -= dt;
      if (this.areaTimer <= 0) this.area.classList.remove('show');
    }
    if (this.guardFlashT > 0) {
      this.guardFlashT -= dt;
      if (this.guardFlashT <= 0) this.guard.classList.remove('flash');
    }
    if (this.bossTitleTimer > 0) {
      this.bossTitleTimer -= dt;
      if (this.bossTitleTimer <= 0) this.bossTitle.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }
}
