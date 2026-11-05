import { glyph, type Action, type Device } from '../core/input';
import { POTIONS } from '../game/flasks';
import type { BudGaugeView } from '../game/buds';
import type { MenuView } from '../game/menu';
import { KEY_HEX, type KeyColor, type Potion } from '../world/dungeon/format';
import { Compass } from './compass';
import { richHtml } from './richText';
import { SkyDial } from './skyDial';

/** A little corked bottle in a potion's color (a pale glass one when empty). */
/** How long a spoken page waits after a mark, in seconds. */
const PAUSES: Record<string, number> = { ',': 0.12, ';': 0.16, ':': 0.16, '.': 0.28, '!': 0.28, '?': 0.28, '—': 0.16 };

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
/**
 * A drawn heart, not the ♥ character: phones swap that glyph for a fixed-colour emoji, so empty and
 * half hearts looked full. The half heart is a hard-stop gradient (`.half` sets the fills in CSS).
 */
const HEART_SVG =
  '<svg viewBox="0 0 24 22" aria-hidden="true"><defs><linearGradient id="hh"><stop offset="50%" stop-color="#ff3b5c"/><stop offset="50%" stop-color="#28141a" stop-opacity="0.55"/></linearGradient></defs>' +
  '<path d="M12 21C5 15 1 11.5 1 7a5.5 5.5 0 0 1 11-1.5A5.5 5.5 0 0 1 23 7c0 4.500-4 8-11 14z"/></svg>';

export class Hud {
  private el = document.getElementById('hud')!;
  private hearts: HTMLElement;
  private guard: HTMLElement;
  private bars: HTMLElement[];
  private bud: HTMLElement;
  private budFill: HTMLElement;
  private budFlashT = 0;
  private guardFlashT = 0;
  private gems: HTMLElement;
  private keys: HTMLElement;
  private heldKeys = '';
  private drinks: HTMLElement;
  private drinksHtml = '';
  private prompt: HTMLElement;
  private promptLabel = '';
  private clock: HTMLElement;
  private dial: SkyDial;
  private compass: Compass;
  private menuHint: HTMLElement;
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
  /** The mouse hovered / clicked a row of the choice window (a dialog question). */
  onChoiceHover: (i: number) => void = () => {};
  onChoiceClick: (i: number) => void = () => {};
  /** The mouse clicked a slider's arrow, dragged its track (0..1), or clicked a tab. */
  onMenuAdjust: (i: number, dir: -1 | 1) => void = () => {};
  onMenuSlide: (i: number, fraction: number) => void = () => {};
  onMenuTab: (i: number) => void = () => {};
  /** A tap on a title row; a tap on a HUD icon that stands for a button (☰, a flask, the glove, a menu's ✕). */
  onTitleClick: (i: number) => void = () => {};
  onTap: (a: Action) => void = () => {};
  /** The slider being dragged: its row and the track's box when the drag began. */
  private drag: { row: number; left: number; width: number } | null = null;
  private bossTitle: HTMLElement;
  private bossBar: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private bossTitleTimer = 0;
  private bossLagValue = 1;
  private device: Device = 'keyboard';
  /** The page being typed. A `paced` (spoken) page breathes after punctuation, like speech. */
  private typing: { full: string; shown: number; paced: boolean; pause: number } = { full: '', shown: 0, paced: false, pause: 0 };
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
      <div class="compass"></div>
      <div class="hud-top-right">
        <div class="clock"></div>
        <div class="clock-text"></div>
        <div class="menu-hint"></div>
      </div>
      <div class="actions"></div>
      <div class="prompt"></div>
      <div class="bud-gauge"><span class="bud-band"></span><span class="bud-fill"></span><span class="bud-edge"></span></div>
      <div class="guard-gauge">${'<span class="bar"><span class="bar-fill"></span></span>'.repeat(3)}</div>
      <div class="area"></div>
      <div class="boss-title"><div class="boss-title-name"></div><div class="boss-title-sub"></div></div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div><div class="boss-mark"></div></div></div>
      <div class="toast"></div>
      <div class="dialog hidden"><div class="dialog-who"></div><div class="dialog-text"></div><div class="dialog-next">▼</div></div>
      <div class="choice-window hidden"></div>
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
          <div><b>E</b> talk · open · read</div><div><b>P</b> pause · <b>M</b> music on/off</div>
          <div class="pad-note">Gamepads work too.</div>
        </div>
        <div class="controls-touch">
          <div><b>Left thumb</b> move</div><div><b>Right thumb</b> drag the camera</div>
          <div><b>Hold Shield</b> guard</div><div><b>Jump</b> jump · talk</div>
          <div><b>☰</b> pause</div><div><b>Tap</b> read on</div>
        </div>
      </div>
      <div class="gmenu hidden"></div>
      <div class="debug hidden"></div>`;
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    this.hearts = q('.hearts');
    this.guard = q('.guard-gauge');
    this.bars = Array.from(this.guard.querySelectorAll<HTMLElement>('.bar-fill'));
    this.bud = q('.bud-gauge');
    this.budFill = q('.bud-fill');
    this.gems = q('.gem-count');
    this.keys = q('.keys');
    this.drinks = q('.drinks');
    this.drinks.addEventListener('click', (e) => {
      const d = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (d) this.onTap(d.dataset.action as Action);
    });
    this.prompt = q('.prompt');
    this.clock = q('.clock-text');
    this.dial = new SkyDial(q('.clock'));
    this.compass = new Compass(q('.compass'));
    this.menuHint = q('.menu-hint');
    this.menuHint.addEventListener('click', () => this.onTap('pause'));
    this.menu = q('.menu');
    this.menu.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (r) this.onTitleClick(Number(r.dataset.row));
    });
    this.renderMenuHint();
    this.actions = q('.actions');
    this.area = q('.area');
    this.dialog = q('.dialog');
    this.dialogWho = q('.dialog-who');
    this.dialogText = q('.dialog-text');
    this.dialogChoices = q('.choice-window');
    this.dialogChoices.addEventListener('mouseover', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (r) this.onChoiceHover(Number(r.dataset.row));
    });
    this.dialogChoices.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (r) this.onChoiceClick(Number(r.dataset.row));
    });
    this.card = q('.card');
    this.title = q('.title');
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
      const el = e.target as HTMLElement;
      const close = el.closest<HTMLElement>('[data-close]');
      if (close) return this.onTap(close.dataset.close as Action);
      const tab = el.closest<HTMLElement>('[data-tab]');
      if (tab) return this.onMenuTab(Number(tab.dataset.tab));
      const arrow = el.closest<HTMLElement>('[data-dir]');
      const r = rowOf(e);
      if (arrow && r) return this.onMenuAdjust(Number(r.dataset.row), Number(arrow.dataset.dir) < 0 ? -1 : 1);
      if (el.closest('[data-track]')) return; // the press already set the slider
      if (r) this.onMenuClick(Number(r.dataset.row));
    });
    // A slider's track: press and drag along it. The box is measured once, so redraws mid-drag don't matter.
    const slideTo = (x: number) => {
      const d = this.drag;
      if (d) this.onMenuSlide(d.row, (x - d.left) / d.width);
    };
    this.gmenu.addEventListener('pointerdown', (e) => {
      const track = (e.target as HTMLElement).closest<HTMLElement>('[data-track]');
      const r = rowOf(e);
      if (!track || !r) return;
      const box = track.getBoundingClientRect();
      this.drag = { row: Number(r.dataset.row), left: box.left, width: box.width };
      slideTo(e.clientX);
    });
    window.addEventListener('pointermove', (e) => slideTo(e.clientX));
    window.addEventListener('pointerup', () => (this.drag = null));
    this.bossTitle = q('.boss-title');
    this.bossBar = q('.boss-bar');
    this.bossFill = q('.boss-fill');
    this.bossLag = q('.boss-lag');
  }

  // --- text formatting ------------------------------------------------------------

  private key(a: Action) {
    return `<span class="key">${escape(glyph(a, this.device))}</span>`;
  }

  /** `[tag]…[/]` spans (ui/richText.ts), `[action]` buttons, newlines. */
  private format(text: string) {
    return richHtml(text, (a) => this.key(a as Action));
  }

  /** Re-renders everything that shows button glyphs when the player switches device. */
  setDevice(d: Device) {
    if (d === this.device) return;
    this.device = d;
    this.el.classList.toggle('gamepad', d === 'gamepad');
    this.el.classList.toggle('touch', d === 'touch');
    this.renderTyping();
    this.renderMenuHint();
    this.lastActionsHtml = '';
    this.setActions(this.lastActions);
    this.promptLabel = '';
    this.drinksHtml = '';
  }

  /** "[P] Menu" (or the pad's button) under the clock, so nobody has to guess how to open the pause menu. */
  private renderMenuHint() {
    this.menuHint.innerHTML = `${this.key('pause')}Menu`;
  }

  // --- status ---------------------------------------------------------------------

  hideTitle() {
    this.title.classList.add('gone');
    this.el.classList.add('playing');
  }

  setTitleMenu(items: string[], selected: number) {
    this.menu.innerHTML = items
      .map((it, i) => `<div class="menu-item${i === selected ? ' selected' : ''}" data-row="${i}">${escape(it)}</div>`)
      .join('');
  }

  /** Draws the open menu (see game/menu.ts), or hides it when null. */
  setMenu(view: MenuView | null) {
    this.gmenu.classList.toggle('hidden', !view);
    let html = '';
    if (view) {
      const row = (r: MenuView['rows'][number], i: number) => {
        const cls = `gmenu-row${r.selected ? ' selected' : ''}${r.space ? ' space' : ''}${r.exit ? ' exit' : ''}`;
        if (r.kind === 'slider') {
          const pct = Math.round((r.fill ?? 0) * 100);
          return `<div class="${cls}" data-row="${i}"><span>${escape(r.label)}</span><span class="gmenu-slider"><i class="gmenu-arrow" data-dir="-1">◂</i><b class="gmenu-track" data-track><b class="gmenu-fill" style="width:${pct}%"></b><b class="gmenu-knob" style="left:${pct}%"></b></b><i class="gmenu-arrow" data-dir="1">▸</i></span><span class="gmenu-value">${escape(r.value ?? '')}</span></div>`;
        }
        const value = r.kind === 'choice' ? `<i class="gmenu-arrow" data-dir="-1">◂</i> ${escape(r.value ?? '')} <i class="gmenu-arrow" data-dir="1">▸</i>` : escape(r.value ?? '');
        return `<div class="${cls}" data-row="${i}"><span>${escape(r.label)}</span><span class="gmenu-value">${value}</span></div>`;
      };
      const tabs = view.tabs
        ? `<div class="gmenu-tabs"><span class="gmenu-tabkey">${this.key('tabPrev')}</span>${view.tabs.labels
            .map((t, i) => `<span class="gmenu-tab${i === view.tabs!.active ? ' active' : ''}" data-tab="${i}">${escape(t)}</span>`)
            .join('')}<span class="gmenu-tabkey">${this.key('tabNext')}</span></div>`
        : `<div class="gmenu-title">${escape(view.title)}</div>`;
      const list = view.rows.map(row).join('');
      const split = view.rows.some((r) => r.kind === 'entry');
      const body = view.body ? `<div class="gmenu-body">${escape(view.body)}</div>` : '';
      const content = split
        ? `<div class="gmenu-split"><div class="gmenu-list">${list}</div><div class="gmenu-detail">${
            view.detail ? `<div class="gmenu-detail-title">${escape(view.detail.title)}</div><div class="gmenu-detail-text">${escape(view.detail.text)}</div>` : ''
          }</div></div>`
        : `${body}<div class="gmenu-list">${list}</div>`;
      const help = `${view.tabs && view.tabs.labels.length > 1 ? `${this.key('tabPrev')}${this.key('tabNext')} tabs · ` : ''}${this.key('menuUp')}${this.key('menuDown')} move · ${
        view.adjustable ? `${this.key('menuLeft')}${this.key('menuRight')} change · ` : ''
      }${view.tabs ? `${this.key('pause')} close` : `${this.key('confirm')} choose · ${this.key('cancel')} back`}`;
      // Touch has no back key: a ✕ in the corner (closes the pause menu, or backs out of anything else).
      const close = `<div class="gmenu-close" data-close="${view.tabs ? 'pause' : 'cancel'}">✕</div>`;
      html = `<div class="gmenu-panel${view.tabs ? ' wide' : ''}${view.compact ? ' compact' : ''}">${close}${tabs}${content}<div class="gmenu-help">${help}</div></div>`;
    }
    if (html === this.gmenuHtml) return;
    const oldScroll = this.gmenu.querySelector('.gmenu-list')?.scrollTop ?? 0;
    this.gmenu.innerHTML = this.gmenuHtml = html;
    const list = this.gmenu.querySelector<HTMLElement>('.gmenu-list');
    if (list) {
      list.scrollTop = oldScroll;
      this.gmenu.querySelector('.gmenu-row.selected')?.scrollIntoView({ block: 'nearest' });
    }
  }

  setHearts(hp: number, max: number) {
    let html = '';
    for (let i = 0; i < max / 2; i++) {
      const v = hp - i * 2;
      html += `<span class="heart ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}">${HEART_SVG}</span>`;
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

  /**
   * The gauge over a stirred Murmurbud (game/buds.ts): the fill, the sweet band where it grows
   * (`band` up), and red while it's overloaded. Null hides it.
   */
  setBudGauge(g: { view: BudGaugeView; at: { x: number; y: number } } | null) {
    this.bud.classList.toggle('show', !!g);
    if (!g) return;
    const { view, at } = g;
    this.bud.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%)`;
    this.bud.style.setProperty('--band', `${Math.round(view.band * 100)}%`);
    const w = `${Math.round(view.gauge * 100)}%`;
    if (this.budFill.style.width !== w) this.budFill.style.width = w;
    this.bud.classList.toggle('in-band', view.gauge >= view.band && !view.overloaded);
    this.bud.classList.toggle('overloaded', view.overloaded);
  }

  /** Shakes the bud gauge (overloaded). */
  flashBudGauge() {
    this.bud.classList.remove('flash');
    void this.bud.offsetWidth; // restart the animation
    this.bud.classList.add('flash');
    this.budFlashT = 0.5;
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
    const item = glove ? `<div class="drink" data-action="item" title="Tether Glove">${gloveIcon}${this.key('item')}</div>` : '';
    const bar = boost > 0 ? `<span class="boost"><span style="width:${Math.round(boost * 100)}%"></span></span>` : '';
    const html = item + slots.map((p, i) => {
      const action: Action = i === 0 ? 'flask1' : 'flask2';
      const title = p ? POTIONS[p].name : 'Empty flask';
      return `<div class="drink${p ? '' : ' empty'}" data-action="${action}" title="${escape(title)}">${bottle(p ? POTIONS[p].color : 'rgba(205, 230, 238, 0.35)')}${this.key(action)}</div>`;
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

  /** The camera's look direction on the ground (x, z), for the compass strip. */
  setHeading(dx: number, dz: number) {
    this.compass.set(dx, dz);
  }

  setClock(hours: number) {
    const h = Math.floor(hours), m = Math.floor(((hours % 1) * 60) / 10) * 10;
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const s = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    if (this.clock.textContent !== s) this.clock.textContent = s;
    this.dial.set(hours);
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

  openDialog(who: string, text: string, paced = false) {
    this.dialog.classList.remove('hidden');
    this.dialogWho.textContent = who;
    this.dialogWho.style.display = who ? '' : 'none';
    this.typing = { full: text, shown: 0, paced, pause: 0 };
    this.dialogText.innerHTML = '';
    this.dialog.classList.remove('done');
  }

  closeDialog() {
    this.dialog.classList.add('hidden');
    this.setChoices(null);
  }

  /** The choice window over the dialog (a question): rows stacked, one highlighted, `exit` drawn red; null hides it. */
  setChoices(options: string[] | null, selected = 0, exit = -1) {
    this.dialogChoices.classList.toggle('hidden', !options);
    this.dialogChoices.innerHTML = options
      ? options
          .map((o, i) => `<div class="choice-row${i === selected ? ' selected' : ''}${i === exit ? ' exit' : ''}" data-row="${i}">${escape(o)}</div>`)
          .join('') + `<div class="choice-help">${this.key('menuUp')}${this.key('menuDown')} move · ${this.key('confirm')} choose</div>`
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
    const shown = this.typing.full.slice(0, cut);
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

  update(dt: number, typed: (from: number, to: number) => void) {
    if (!this.dialog.classList.contains('hidden') && !this.dialogDone) {
      const t = this.typing;
      if (t.pause > 0) t.pause -= dt;
      else {
        const before = Math.floor(t.shown);
        let next = Math.min(t.full.length, t.shown + dt * 55);
        if (t.paced) {
          // Stop just after a comma or full stop (at a word's end) to breathe.
          for (let i = before; i < Math.floor(next); i++) {
            const pause = PAUSES[t.full[i]];
            if (pause && (i + 1 >= t.full.length || /\s/.test(t.full[i + 1]))) {
              next = i + 1;
              t.pause = pause;
              break;
            }
          }
        }
        t.shown = next;
        if (Math.floor(next) !== before) {
          typed(before, Math.floor(next));
          this.renderTyping();
        }
      }
    }
    if (this.areaTimer > 0) {
      this.areaTimer -= dt;
      if (this.areaTimer <= 0) this.area.classList.remove('show');
    }
    if (this.budFlashT > 0) {
      this.budFlashT -= dt;
      if (this.budFlashT <= 0) this.bud.classList.remove('flash');
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
