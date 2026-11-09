import { glyph, type Action, type Device } from '../core/input';
import { POTIONS } from '../game/flasks';
import type { BudGaugeView } from '../game/buds';
import type { MenuView } from '../game/menu';

/** What a menu's mouse and touch do (the pause menu's and the dev panel's are separate sets). */
export interface MenuHandlers {
  hover(i: number): void;
  click(i: number): void;
  adjust(i: number, dir: -1 | 1): void;
  slide(i: number, fraction: number): void;
  pick(i: number, opt: number): void;
  reset(i: number): void;
}
import { KEY_HEX, type KeyColor, type Potion } from '../world/dungeon/format';
import { Compass } from './compass';
import { richHtml } from './richText';
import { cornerView } from './corner';
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
  /** The icon (a PNG data URL) for a registry id, from the game's `Icons`; blank before it is set. */
  icon: (id: string) => string = () => '';
  private prompt: HTMLElement;
  private promptLabel = '';
  private clock: HTMLElement;
  private place: HTMLElement;
  private clockEl: HTMLElement;
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
  /** The menu is redrawing because the mouse moved onto a row: it is already in view, so don't scroll to it. */
  private hoverDraw = false;
  private gmenuSelected = '';
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
  /** The hide button (touch) went down / up; a drag over the live view (pixels; `finger` for touch). */
  onMenuPeek: (on: boolean) => void = () => {};
  onMenuLook: (dx: number, dy: number, finger: boolean) => void = () => {};
  /** The dev panel's mouse handlers (game/devPanel.ts); the pause menu's are the `onMenu*` fields. */
  devHandlers: MenuHandlers = { hover: () => {}, click: () => {}, adjust: () => {}, slide: () => {}, pick: () => {}, reset: () => {} };
  onMenuReset: (i: number) => void = () => {};
  onMenuPick: (i: number, opt: number) => void = () => {};
  private devmenu: HTMLElement;
  private perfEl: HTMLElement;
  private perfText = '';
  private devmenuHtml = '';
  private devSelected = -1;
  /** What each animated control showed when last drawn (a toggle's state, a capsule's option), so a change can slide. */
  private shown = new Map<string, number>();
  private lookDrag: { id: number; x: number; y: number } | null = null;
  private peekId: number | null = null;
  /** A tap on a title row; a tap on a HUD icon that stands for a button (☰, a flask, the glove, a menu's ✕). */
  onTitleClick: (i: number) => void = () => {};
  onTap: (a: Action) => void = () => {};
  /** The slider being dragged: its row and the track's box when the drag began. */
  private drag: { row: number; left: number; width: number; slide: (row: number, fraction: number) => void } | null = null;
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
        <div class="top-row"><div class="menu-btn">☰</div><div class="hearts"></div></div>
        <div class="gems"><span class="gem-icon"></span><span class="gem-count">0</span></div>
        <div class="keys hidden">${SMALL_KEY_SVG}<span class="key-count">×0</span><span class="color-keys"></span>${BOSS_KEY_SVG}</div>
        <div class="drinks"></div>
      </div>
      <div class="compass"></div>
      <div class="hud-top-right">
        <div class="clock"></div>
        <div class="clock-text"></div>
        <div class="place"></div>
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
          <div><b>Hold Shield</b> guard</div><div><b>Jump</b> jump · <b>Talk</b> appears when near</div>
          <div><b>☰</b> pause</div><div><b>Tap</b> read on</div>
        </div>
      </div>
      <div class="perf hidden"></div>
      <div class="gmenu hidden"></div>
      <div class="devmenu hidden" data-lookdrag></div>
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
    this.place = q('.place');
    this.clockEl = q('.clock');
    this.dial = new SkyDial(this.clockEl);
    this.compass = new Compass(q('.compass'));
    this.menuHint = q('.menu-hint');
    this.menuHint.addEventListener('click', () => this.onTap('pause'));
    q('.menu-btn').addEventListener('click', () => this.onTap('pause'));
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
    this.devmenu = q('.devmenu');
    this.perfEl = q('.perf');
    const rowOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    /** Mouse and touch on a menu element: hover, click, a slider's track, an option, a drag on the world, the hide button. */
    const bind = (el: HTMLElement, h: () => MenuHandlers) => {
      // Hover follows the mouse's own movement, not rows scrolling under a resting cursor (a trackpad
      // fling would otherwise redraw the menu mid-scroll, stop its momentum and snap back to the selection).
      el.addEventListener('mousemove', (e) => {
        if (e.movementX === 0 && e.movementY === 0) return;
        const r = rowOf(e);
        if (!r || r.classList.contains('selected')) return;
        this.hoverDraw = true;
        try { h().hover(Number(r.dataset.row)); } finally { this.hoverDraw = false; }
      });
      el.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const close = t.closest<HTMLElement>('[data-close]');
        if (close) return this.onTap(close.dataset.close as Action);
        const tab = t.closest<HTMLElement>('[data-tab]');
        if (tab) return this.onMenuTab(Number(tab.dataset.tab));
        const r = rowOf(e);
        if (r && t.closest('[data-reset]')) return h().reset(Number(r.dataset.row));
        const opt = t.closest<HTMLElement>('[data-opt]');
        if (opt && r) return h().pick(Number(r.dataset.row), Number(opt.dataset.opt));
        const arrow = t.closest<HTMLElement>('[data-dir]');
        if (arrow && r) return h().adjust(Number(r.dataset.row), Number(arrow.dataset.dir) < 0 ? -1 : 1);
        if (t.closest('[data-track]')) return; // the press already set the slider
        if (r) h().click(Number(r.dataset.row));
      });
      el.addEventListener('pointerdown', (e) => {
        const t = e.target as HTMLElement;
        const track = t.closest<HTMLElement>('[data-track]');
        const r = rowOf(e);
        if (track && r) {
          // A slider's track: press and drag along it. The box is measured once, so redraws mid-drag don't matter.
          const box = track.getBoundingClientRect();
          this.drag = { row: Number(r.dataset.row), left: box.left, width: box.width, slide: (row, f) => h().slide(row, f) };
          this.drag.slide(this.drag.row, (e.clientX - box.left) / box.width);
        } else if (t.hasAttribute('data-lookdrag') || t === el) {
          // The world behind a menu that lets it show (the dev panel): a drag turns the camera.
          if (el === this.devmenu) this.lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        } else if (t.closest('[data-peek]')) {
          this.peekId = e.pointerId;
          this.onMenuPeek(true);
        }
      });
    };
    bind(this.gmenu, () => ({
      hover: (i) => this.onMenuHover(i), click: (i) => this.onMenuClick(i), adjust: (i, d) => this.onMenuAdjust(i, d),
      slide: (i, f) => this.onMenuSlide(i, f), pick: (i, o) => this.onMenuPick(i, o), reset: (i) => this.onMenuReset(i),
    }));
    bind(this.devmenu, () => this.devHandlers);
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (d) d.slide(d.row, (e.clientX - d.left) / d.width);
      const l = this.lookDrag;
      if (l && l.id === e.pointerId) {
        this.onMenuLook(e.clientX - l.x, e.clientY - l.y, e.pointerType === 'touch');
        l.x = e.clientX;
        l.y = e.clientY;
      }
    });
    const release = (e: PointerEvent) => {
      this.drag = null;
      if (this.lookDrag?.id === e.pointerId) this.lookDrag = null;
      if (this.peekId === e.pointerId) {
        this.peekId = null;
        this.onMenuPeek(false);
      }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
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

  /** One row of a menu: a label and its control (a slider's track, a switch, a capsule of all the options, a value). */
  private menuRow(r: MenuView['rows'][number], i: number, anyReset: boolean) {
    const cls = `gmenu-row${r.selected ? ' selected' : ''}${r.space ? ' space' : ''}${r.exit ? ' exit' : ''}${r.locked ? ' locked' : ''}`;
    const head = r.group ? `<div class="gmenu-group">${escape(r.group)}</div>` : '';
    // A reset button (↺) closes a setting's row; dim when it is already at its default. Rows without one keep the space, so the controls line up.
    const reset = r.resettable ? `<i class="reset${r.changed && !r.locked ? '' : ' off'}" data-reset title="Reset to default"><svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5.2 3 9.6 0.4v5.2z" fill="currentColor"/></svg></i>` : anyReset && (r.kind === 'slider' || r.kind === 'toggle' || r.kind === 'choice') ? '<i class="reset none"></i>' : '';
    if (r.kind === 'slider') {
      const pct = Math.round((r.fill ?? 0) * 100);
      return `${head}<div class="${cls}" data-row="${i}"><span>${escape(r.label)}</span><span class="gmenu-slider"><i class="gmenu-arrow" data-dir="-1">◂</i><b class="gmenu-track" data-track><b class="gmenu-fill" style="width:${pct}%"></b><b class="gmenu-knob" style="left:${pct}%"></b></b><i class="gmenu-arrow" data-dir="1">▸</i></span><span class="gmenu-value">${escape(r.value ?? '')}</span>${reset}</div>`;
    }
    let control: string;
    if (r.kind === 'toggle') {
      control = `<span class="sw${r.on ? ' on' : ''}" data-anim="${i}" data-to="${r.on ? 1 : 0}"><i class="sw-knob"></i></span>`;
    } else if (r.kind === 'choice' && r.options) {
      const n = r.options.length;
      const at = r.index ?? 0;
      control = `<span class="seg" style="--n:${n}"><i class="seg-pill" data-anim="${i}" data-to="${at}" style="left:${(at * 100) / n}%"></i>${r.options
        .map((o, k) => `<i class="seg-opt${k === at ? ' on' : ''}" data-opt="${k}">${escape(o)}</i>`)
        .join('')}</span>`;
    } else {
      const icon = r.icon ? `<img class="gmenu-icon" src="${r.icon}" alt="" draggable="false">` : '';
      return `${head}<div class="${cls}" data-row="${i}"><span>${icon}${escape(r.label)}</span><span class="gmenu-value">${escape(r.value ?? '')}</span></div>`;
    }
    return `${head}<div class="${cls}" data-row="${i}"><span>${escape(r.label)}</span>${control}${reset}</div>`;
  }

  /** After a redraw: a switch or capsule whose state changed starts from where it was and slides to where it is. */
  private slideControls(root: HTMLElement, ns: string) {
    for (const el of root.querySelectorAll<HTMLElement>('[data-anim]')) {
      const key = `${ns}|${el.dataset.anim}`;
      const to = Number(el.dataset.to);
      const from = this.shown.get(key);
      this.shown.set(key, to);
      if (from === undefined || from === to) continue;
      const pill = el.classList.contains('seg-pill');
      const n = Number(el.parentElement?.style.getPropertyValue('--n')) || 1;
      el.style.transition = 'none';
      if (pill) el.style.left = `${(from * 100) / n}%`;
      else el.classList.toggle('on', from === 1);
      void el.offsetWidth;
      el.style.transition = '';
      if (pill) el.style.left = `${(to * 100) / n}%`;
      else el.classList.toggle('on', to === 1);
    }
  }

  /** Draws the open menu (see game/menu.ts), or hides it when null. */
  setMenu(view: MenuView | null) {
    this.gmenu.classList.toggle('hidden', !view);
    this.gmenu.classList.toggle('peeking', !!view?.peeking);
    let html = '';
    if (view) {
      const tabs = view.tabs
        ? `<div class="gmenu-tabs"><span class="gmenu-tabkey">${this.key('tabPrev')}</span>${view.tabs.labels
            .map((t, i) => `<span class="gmenu-tab${i === view.tabs!.active ? ' active' : ''}" data-tab="${i}">${escape(t)}</span>`)
            .join('')}<span class="gmenu-tabkey">${this.key('tabNext')}</span></div>`
        : `<div class="gmenu-title">${escape(view.title)}</div>`;
      const anyReset = view.rows.some((r) => r.resettable);
      const list = view.rows.map((r, i) => this.menuRow(r, i, anyReset)).join('');
      const split = view.rows.some((r) => r.kind === 'entry');
      const body = view.body ? `<div class="gmenu-body">${escape(view.body)}</div>` : '';
      const content = split
        ? `<div class="gmenu-split"><div class="gmenu-list">${list}</div><div class="gmenu-detail">${
            view.detail ? `${view.detail.icon ? `<img class="gmenu-detail-icon" src="${view.detail.icon}" alt="" draggable="false">` : ''}<div class="gmenu-detail-title">${escape(view.detail.title)}</div><div class="gmenu-detail-text">${escape(view.detail.text)}</div>` : ''
          }</div></div>`
        : `${body}<div class="gmenu-list">${list}</div>`;
      const help = `${view.tabs ? `${this.key('hideMenu')} hold to hide · ` : ''}${view.tabs && view.tabs.labels.length > 1 ? `${this.key('tabPrev')}${this.key('tabNext')} tabs · ` : ''}${this.key('menuUp')}${this.key('menuDown')} move · ${
        view.adjustable ? `${this.key('menuLeft')}${this.key('menuRight')} change · ` : ''
      }${view.resettable ? `${this.key('menuReset')} reset · ` : ''}${view.tabs ? `${this.key('pause')} close` : `${this.key('confirm')} choose · ${this.key('cancel')} back`}`;
      // Touch has no back key: a ✕ in the corner (closes the pause menu, or backs out of anything else).
      const close = `<div class="gmenu-close" data-close="${view.tabs ? 'pause' : 'cancel'}">✕</div><div class="gmenu-peek" data-peek>Hold<br>to hide</div>`;
      html = `<div class="gmenu-panel${view.tabs ? ' wide' : ''}${view.compact ? ' compact' : ''}">${close}${tabs}${content}<div class="gmenu-help">${help}</div></div>`;
    }
    if (html === this.gmenuHtml) return;
    const oldList = this.gmenu.querySelector<HTMLElement>('.gmenu-list');
    const oldScroll = oldList?.scrollTop ?? 0;
    const oldDetail = this.gmenu.querySelector<HTMLElement>('.gmenu-detail')?.scrollTop ?? 0;
    this.gmenu.innerHTML = this.gmenuHtml = html;
    this.slideControls(this.gmenu, `${view?.title}|${view?.tabs?.active ?? ''}`);
    const list = this.gmenu.querySelector<HTMLElement>('.gmenu-list');
    // Only the selection moving (keys, pad, a new menu) scrolls to it. Any other redraw (a value
    // ticking, the mouse) leaves the player's own scrolling alone.
    const sel = view ? `${view.title}|${view.tabs?.active ?? ''}|${view.rows.findIndex((r) => r.selected)}` : '';
    const moved = sel !== this.gmenuSelected;
    this.gmenuSelected = sel;
    if (list) {
      list.scrollTop = oldScroll;
      const detail = this.gmenu.querySelector<HTMLElement>('.gmenu-detail');
      if (detail) detail.scrollTop = oldDetail;
      if (moved && !this.hoverDraw) this.gmenu.querySelector('.gmenu-row.selected')?.scrollIntoView({ block: 'nearest' });
    }
  }

  /** The performance meter's text (game/perf.ts), or null to hide it. */
  setPerf(text: string | null) {
    this.perfEl.classList.toggle('hidden', text === null);
    if (text === null || text === this.perfText) return;
    this.perfText = text;
    this.perfEl.textContent = text;
  }

  /** Draws the dev panel (game/devPanel.ts): plain rows down the right edge, or nothing when null. */
  setDevMenu(view: MenuView | null) {
    this.devmenu.classList.toggle('hidden', !view);
    this.devmenu.classList.toggle('peeking', !!view?.peeking);
    const anyReset = view?.rows.some((r) => r.resettable) ?? false;
    const rows = (pinned: boolean) => view!.rows.map((r, i) => (!!r.pinned === pinned ? this.menuRow(r, i, anyReset) : '')).join('');
    const html = view
      ? `<div class="devmenu-panel"><div class="devmenu-title">${escape(view.title)}</div><div class="gmenu-list">${rows(false)}</div><div class="devmenu-pinned">${rows(true)}</div><div class="devmenu-help">${this.key('devMenu')} close · ${this.key('menuReset')} reset · ${this.key('hideMenu')} hold to hide · drag to turn</div></div>`
      : '';
    if (html === this.devmenuHtml) return;
    const scroll = this.devmenu.querySelector<HTMLElement>('.gmenu-list')?.scrollTop ?? 0;
    this.devmenu.innerHTML = this.devmenuHtml = html;
    this.slideControls(this.devmenu, 'dev');
    const list = this.devmenu.querySelector<HTMLElement>('.gmenu-list');
    if (!list) return;
    list.scrollTop = scroll;
    const sel = view!.rows.findIndex((r) => r.selected);
    const moved = sel !== this.devSelected;
    this.devSelected = sel;
    if (moved && !this.hoverDraw) this.devmenu.querySelector('.gmenu-row.selected')?.scrollIntoView({ block: 'nearest' });
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

  /** An icon as an <img>; `fallback` (the old drawing) if it could not be rendered. */
  private img(id: string, cls: string, fallback: string) {
    const url = this.icon(id);
    return url ? `<img class="${cls}" src="${url}" width="28" height="28" alt="" draggable="false">` : fallback;
  }

  /**
   * The glove (once held) and the flasks Wren owns: a bottle each in its potion's color, or
   * an empty one, with its button. `boost`: how much of an attack potion is left (0–1),
   * shown under the item row while it lasts.
   */
  setFlasks(slots: readonly (Potion | null)[], boost: number, glove = false) {
    const item = glove ? `<div class="drink" data-action="item" title="Tether Glove">${this.img('gear-glove', 'glove', gloveIcon)}${this.key('item')}</div>` : '';
    const bar = boost > 0 ? `<span class="boost"><span style="width:${Math.round(boost * 100)}%"></span></span>` : '';
    const html = item + slots.map((p, i) => {
      const action: Action = i === 0 ? 'flask1' : 'flask2';
      const title = p ? POTIONS[p].name : 'Empty flask';
      return `<div class="drink${p ? '' : ' empty'}" data-action="${action}" title="${escape(title)}">${this.img(p ? `gear-flask-${p}` : 'gear-flask', 'bottle', bottle(p ? POTIONS[p].color : 'rgba(205, 230, 238, 0.35)'))}${this.key(action)}</div>`;
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

  /** The corner: the sky dial and time, or a dungeon's picture (see ui/corner.ts), and the place's name under it. */
  setCorner(hours: number, place: string, portrait: string | null) {
    const v = cornerView(place, portrait);
    this.clockEl.classList.toggle('picture', v.picture);
    this.clockEl.style.backgroundImage = v.picture ? `url(${portrait})` : '';
    this.clock.style.display = v.showTime ? '' : 'none';
    if (this.place.textContent !== v.name) this.place.textContent = v.name;
    this.place.title = v.name;
    this.place.style.display = v.name ? '' : 'none';
    if (v.showTime) this.setClock(hours);
  }

  private setClock(hours: number) {
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
