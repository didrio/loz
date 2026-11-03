/**
 * Input is read as *actions* ("attack", "jump"), never raw keys, so keyboard, mouse and
 * gamepad all drive the same code and on-screen prompts can show the right button.
 */

export type Action =
  | 'attack' | 'shield' | 'jump' | 'lock' | 'interact'
  | 'confirm' | 'cancel' | 'pause' | 'music' | 'menuUp' | 'menuDown'
  | 'flask1' | 'flask2' | 'item'
  /** Dev builds and ?debug only: opens the dev menu (~ / L3). */
  | 'devMenu';

export type Device = 'keyboard' | 'gamepad';

/** `KeyboardEvent.code`s, plus `Mouse0` (left) / `Mouse2` (right). */
const KEYS: Record<Action, string[]> = {
  attack: ['Mouse0', 'KeyJ'],
  shield: ['ShiftLeft', 'ShiftRight', 'Mouse2'],
  jump: ['Space'],
  lock: ['KeyQ', 'Tab'],
  interact: ['KeyE', 'Enter'],
  confirm: ['Enter', 'Space', 'KeyE', 'Mouse0'],
  cancel: ['Escape', 'Backspace'],
  pause: ['KeyP'],
  music: ['KeyM'],
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  flask1: ['Digit1', 'Numpad1'],
  flask2: ['Digit2', 'Numpad2'],
  item: ['KeyF'],
  devMenu: ['Backquote'],
};

/**
 * Standard gamepad mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start,
 * 10 L3, 11 R3 (stick clicks), 12–15 d-pad up/down/left/right. A both talks and jumps: the
 * game checks "interact" first. Lock-on is the right stick click, Souls-style. So both hands
 * work out of the box (owner's call, 2026-11-03, may change): attack is X and both right
 * shoulders (RB, RT); the shield is both left shoulders (LB, LT).
 */
const PAD: Record<Action, number[]> = {
  attack: [2, 5, 7],
  shield: [6, 4],
  jump: [0],
  lock: [11],
  interact: [0],
  confirm: [0, 9],
  cancel: [1],
  pause: [9],
  music: [8],
  menuUp: [12],
  menuDown: [13],
  flask1: [14],
  flask2: [15],
  item: [3],
  devMenu: [10],
};

const KEY_GLYPH: Record<Action, string> = {
  attack: 'Click', shield: 'Shift', jump: 'Space', lock: 'Q', interact: 'E',
  confirm: 'Enter', cancel: 'Esc', pause: 'P', music: 'M', menuUp: 'W', menuDown: 'S', flask1: '1', flask2: '2', item: 'F', devMenu: '~',
};

const PAD_GLYPH: Record<Action, string> = {
  attack: 'X / RT', shield: 'LT / LB', jump: 'A', lock: 'R3', interact: 'A',
  confirm: 'A', cancel: 'B', pause: 'Start', music: 'Back', menuUp: '↑', menuDown: '↓', flask1: '←', flask2: '→', item: 'Y', devMenu: 'L3',
};

/** The button label to show for an action on a device. */
export function glyph(action: Action, device: Device) {
  return (device === 'gamepad' ? PAD_GLYPH : KEY_GLYPH)[action];
}

export const ACTIONS = Object.keys(KEYS) as Action[];

/** Radial deadzone: ignores small stick drift, then rescales so output still reaches 1. */
export function deadzone(x: number, y: number, dz = 0.18) {
  const len = Math.hypot(x, y);
  if (len < dz) return { x: 0, y: 0 };
  const scale = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: x * scale, y: y * scale };
}

export class Input {
  device: Device = 'keyboard';
  locked = false;
  private keysHeld = new Set<string>();
  private keysPressed = new Set<string>();
  private padHeld = new Set<number>();
  private padPressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private leftStick = { x: 0, y: 0 };
  private rightStick = { x: 0, y: 0 };
  private stickNav = 0;
  private stickNavPressed = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.keysPressed.add(e.code);
      this.keysHeld.add(e.code);
      this.device = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keysHeld.delete(e.code));
    window.addEventListener('blur', () => this.keysHeld.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.keysHeld.add('Mouse' + e.button);
      this.keysPressed.add('Mouse' + e.button);
      this.device = 'keyboard';
    });
    window.addEventListener('mouseup', (e) => this.keysHeld.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  /** Reads the gamepad. Call once at the start of every frame. */
  poll() {
    const pads = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p?.connected);
    const pad = pads.find((p) => p.mapping === 'standard') ?? pads[0];
    if (!pad) {
      this.padHeld.clear();
      this.leftStick = { x: 0, y: 0 };
      this.rightStick = { x: 0, y: 0 };
      return;
    }
    pad.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5;
      if (down && !this.padHeld.has(i)) {
        this.padPressed.add(i);
        this.device = 'gamepad';
      }
      if (down) this.padHeld.add(i);
      else this.padHeld.delete(i);
    });
    this.leftStick = deadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    this.rightStick = deadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    if (Math.hypot(this.leftStick.x, this.leftStick.y) > 0.5 || Math.hypot(this.rightStick.x, this.rightStick.y) > 0.5) {
      this.device = 'gamepad';
    }
    // Menu navigation with the stick: one step per push.
    const nav = this.leftStick.y < -0.6 ? -1 : this.leftStick.y > 0.6 ? 1 : 0;
    if (nav !== 0 && nav !== this.stickNav) this.stickNavPressed = nav;
    this.stickNav = nav;
  }

  /** True on the frame the action was pressed. */
  pressed(a: Action) {
    if (a === 'menuUp' && this.stickNavPressed === -1) return true;
    if (a === 'menuDown' && this.stickNavPressed === 1) return true;
    return KEYS[a].some((k) => this.keysPressed.has(k)) || PAD[a].some((b) => this.padPressed.has(b));
  }

  /** True while the action is held. */
  held(a: Action) {
    return KEYS[a].some((k) => this.keysHeld.has(k)) || PAD[a].some((b) => this.padHeld.has(b));
  }

  /** True on the frame the left mouse button was clicked on the canvas. */
  clicked() {
    return this.keysPressed.has('Mouse0');
  }

  /** Movement intent: x = right, y = forward, length at most 1. */
  move() {
    const k = (code: string) => (this.keysHeld.has(code) ? 1 : 0);
    let x = k('KeyD') - k('KeyA') + this.leftStick.x;
    let y = k('KeyW') - k('KeyS') - this.leftStick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Camera turn this frame, in radians: mouse (when captured), right stick and arrow keys. */
  look(dt: number) {
    const k = (code: string) => (this.keysHeld.has(code) ? 1 : 0);
    let yaw = (k('ArrowLeft') - k('ArrowRight')) * 2.2 * dt - this.rightStick.x * 2.8 * dt;
    let pitch = (k('ArrowDown') - k('ArrowUp')) * 1.2 * dt + this.rightStick.y * 1.6 * dt;
    if (this.locked) {
      yaw -= this.mouseDX * 0.0028;
      pitch += this.mouseDY * 0.002;
    }
    return { yaw, pitch };
  }

  requestLock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock?.() as unknown;
    if (p instanceof Promise) p.catch(() => {});
  }

  endFrame() {
    this.keysPressed.clear();
    this.padPressed.clear();
    this.stickNavPressed = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
