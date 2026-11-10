/**
 * The on-screen controls for phones and tablets (landscape). Only on a touch device: one whose
 * main pointer is a finger (`pointer: coarse` and no hover), so desktops and touchscreen laptops
 * never see them. `?touch=1` / `?touch=0` force them on or off (tests, look scenes).
 *
 * This is the DOM half: it draws the stick and buttons, hit-tests each finger once when it lands
 * (by geometry: `hitButton`, the nearest rim within the circle plus `SLOP`) and hands it to `core/touch.ts`,
 * which turns fingers into actions for `Input`. It sits under the HUD, so the HUD's own tappable bits
 * (menu rows, dialog choices, flasks, ☰, the floating prompt) get their taps first.
 * The game tells it what to show each frame (`setContext`); it knows nothing else about the game.
 */
import type { Input } from '../core/input';
import { TouchPad, hitButton, type ButtonZone, type FingerRole } from '../core/touch';

/** What the overlay is for right now. `title`/`menu`: taps go to the HUD's rows. `dialog`: a tap anywhere reads on. */
export type TouchMode = 'play' | 'dialog' | 'menu' | 'title' | 'off';

export interface TouchContext {
  mode: TouchMode;
  /** The verb on the Interact button when something is in reach ("Talk", "Open"); null hides the button. */
  use: string | null;
  sword: boolean;
  shield: boolean;
  tether: boolean;
  locked: boolean;
}

type ButtonId = 'attack' | 'jump' | 'interact' | 'shield' | 'lock' | 'item';

type ButtonRole = Extract<FingerRole, { kind: 'button' }>;

/** How far past a button's drawn rim a tap still counts, px (the gaps between buttons are wider, and the nearer rim wins anyway). */
const SLOP = 12;
/** Interact's is wider: it's the button you reach for mid-stride, and nothing sits right beside it. */
const INTERACT_SLOP = 18;

const ROLES: Record<ButtonId, ButtonRole> = {
  attack: { kind: 'button', actions: ['attack'] },
  // Jump is only jump: interact has its own button, so a sign beside you never turns a jump into a read.
  jump: { kind: 'button', actions: ['jump'] },
  interact: { kind: 'button', actions: ['interact'] },
  // Hold to guard (jump, then hold it to land on it: the surf).
  shield: { kind: 'button', actions: ['shield'] },
  lock: { kind: 'button', actions: ['lock'] },
  item: { kind: 'button', actions: ['item'] },
};

/** Whether this device should get the touch controls. */
export function wantsTouch(): boolean {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return matchMedia('(pointer: coarse) and (hover: none)').matches;
}

export class TouchControls {
  readonly pad = new TouchPad();
  private readonly el = document.createElement('div');
  private readonly rotate = document.createElement('div');
  private readonly stickBase: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly buttons: Record<ButtonId, HTMLElement>;
  private enabled: boolean;
  private mode: TouchMode = 'title';
  private shown = '';

  /** `onGesture` runs inside the touch's own event, which is where iOS lets audio start. */
  constructor(private readonly input: Input, hud: HTMLElement, private readonly onGesture: () => void) {
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="touch-stick hidden"><div class="touch-knob"></div></div>
      <div class="touch-btn tb-attack" data-btn="attack">Sword</div>
      <div class="touch-btn tb-jump" data-btn="jump">Jump</div>
      <div class="touch-btn tb-interact" data-btn="interact"></div>
      <div class="touch-btn tb-shield" data-btn="shield">Shield</div>
      <div class="touch-btn tb-lock" data-btn="lock">Lock</div>
      <div class="touch-btn tb-item" data-btn="item">Glove</div>`;
    this.rotate.className = 'touch-rotate';
    this.rotate.innerHTML = '<div class="touch-rotate-icon">⟳</div><div>Turn your device sideways</div>';
    document.body.insertBefore(this.el, hud);
    document.body.appendChild(this.rotate);
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    this.stickBase = q('.touch-stick');
    this.stickKnob = q('.touch-knob');
    this.buttons = { attack: q('.tb-attack'), jump: q('.tb-jump'), interact: q('.tb-interact'), shield: q('.tb-shield'), lock: q('.tb-lock'), item: q('.tb-item') };

    this.enabled = wantsTouch();
    if (this.enabled) this.enable();
    const query = matchMedia('(pointer: coarse) and (hover: none)');
    query.addEventListener('change', () => {
      if (new URLSearchParams(location.search).has('touch') || query.matches === this.enabled) return;
      this.enabled = query.matches;
      if (this.enabled) this.enable();
      else this.disable();
    });

    // The browser's own touch gestures never start on the controls: no edge swipe back (iOS Safari), no double-tap zoom, no
    // magnifier on a long press, no pull to refresh. (`touch-action: none` covers most, not the edge swipe; pointer events'
    // preventDefault doesn't cancel touch gestures, so this is a touch listener.) The HUD's taps are on its own elements.
    this.el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.device = 'touch';
      try { this.el.setPointerCapture(e.pointerId); } catch { /* a finger that already lifted: still count its tap */ }
      const role = this.roleAt(e);
      if (role) this.pad.down(e.pointerId, e.clientX, e.clientY, role);
    });
    this.el.addEventListener('pointermove', (e) => this.pad.move(e.pointerId, e.clientX, e.clientY));
    const lift = (e: PointerEvent) => {
      this.pad.up(e.pointerId);
      this.onGesture();
    };
    this.el.addEventListener('pointerup', lift);
    this.el.addEventListener('pointercancel', lift);
    // Any touch anywhere means touch (the overlay can't hear one while it's hidden after a key press).
    window.addEventListener('pointerdown', (e) => {
      if (this.enabled && e.pointerType === 'touch') this.input.device = 'touch';
    }, { capture: true });
    hud.addEventListener('pointerup', () => this.enabled && this.onGesture());
    window.addEventListener('blur', () => this.pad.clear());
  }

  /** On a touch device in portrait: the game waits behind the "turn sideways" card. */
  get blocked() {
    return this.enabled && matchMedia('(orientation: portrait)').matches;
  }

  /** Called every frame by the game. */
  setContext(c: TouchContext) {
    const visible = this.enabled && this.input.device === 'touch';
    const mode: TouchMode = visible ? c.mode : 'off';
    if (mode !== this.mode) {
      this.mode = mode;
      this.pad.clear();
    }
    const key = `${mode}|${c.use}|${c.sword}|${c.shield}|${c.tether}|${c.locked}`;
    if (key !== this.shown) {
      this.shown = key;
      this.el.classList.toggle('hidden', mode === 'off');
      this.el.classList.toggle('playing', mode === 'play');
      this.buttons.attack.classList.toggle('hidden', !c.sword);
      this.buttons.shield.classList.toggle('hidden', !c.shield);
      this.buttons.item.classList.toggle('hidden', !c.tether);
      this.buttons.lock.classList.toggle('on', c.locked);
      const b = this.buttons.interact;
      // It fades out still reading its last verb, so a leaving "Talk" doesn't blank mid-fade.
      if (c.use) {
        b.textContent = c.use;
        b.classList.toggle('long', c.use.length > 6); // two words or a long one: smaller type
      }
      b.classList.toggle('show', !!c.use);
    }
    for (const [id, b] of Object.entries(this.buttons) as [ButtonId, HTMLElement][]) b.classList.toggle('down', this.pad.held(ROLES[id].actions[0]));
    const v = this.pad.stickView;
    this.stickBase.classList.toggle('hidden', !v);
    if (v) {
      this.stickBase.style.transform = `translate(${v.cx}px, ${v.cy}px)`;
      this.stickKnob.style.transform = `translate(${v.x - v.cx}px, ${v.y - v.cy}px)`;
    }
  }

  private roleAt(e: PointerEvent): FingerRole | null {
    if (this.mode === 'dialog') return { kind: 'button', actions: ['confirm'] };
    if (this.mode !== 'play') return null;
    const btn = hitButton(this.zones(), e.clientX, e.clientY);
    if (btn) return ROLES[btn];
    return e.clientX < window.innerWidth * 0.45 ? { kind: 'stick' } : { kind: 'look' };
  }

  /** The buttons on screen now, as circles (read when a finger lands: six rects, no layout cache to go stale). */
  private zones(): ButtonZone<ButtonId>[] {
    const zones: ButtonZone<ButtonId>[] = [];
    for (const [id, b] of Object.entries(this.buttons) as [ButtonId, HTMLElement][]) {
      if (b.classList.contains('hidden') || (id === 'interact' && !b.classList.contains('show'))) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue; // display: none
      zones.push({ id, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2, slop: id === 'interact' ? INTERACT_SLOP : SLOP });
    }
    return zones;
  }

  private enable() {
    this.input.touch = this.pad;
    this.input.device = 'touch';
    document.documentElement.classList.add('touch-device');
    blockPageGestures();
  }

  private disable() {
    this.pad.clear();
    this.input.touch = null;
    if (this.input.device === 'touch') this.input.device = 'keyboard';
    document.documentElement.classList.remove('touch-device');
  }
}

let gesturesBlocked = false;

/**
 * A game, not a page: on a touch device nothing zooms, selects, or pops a menu. iOS Safari ignores `user-scalable=no` and
 * pinches through `touch-action` on some elements (its own `gesture*` events), and a long press opens the context menu.
 */
function blockPageGestures() {
  if (gesturesBlocked) return;
  gesturesBlocked = true;
  const stop = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
    document.addEventListener(type, stop, { passive: false });
  }
}
