/**
 * Input is read as *actions* ("attack", "jump"), never raw keys, so keyboard, mouse and
 * gamepad all drive the same code and on-screen prompts can show the right button.
 */

export type Action =
  | 'attack' | 'shield' | 'jump' | 'lock' | 'interact' | 'flute'
  | 'confirm' | 'cancel' | 'music' | 'menuUp' | 'menuDown'
  | 'note0' | 'note1' | 'note2' | 'note3' | 'note4';

export type Device = 'keyboard' | 'gamepad';

/** `KeyboardEvent.code`s, plus `Mouse0` (left) / `Mouse2` (right). */
const KEYS: Record<Action, string[]> = {
  attack: ['Mouse0', 'KeyJ'],
  shield: ['ShiftLeft', 'ShiftRight', 'Mouse2'],
  jump: ['Space'],
  lock: ['KeyQ', 'Tab'],
  interact: ['KeyE', 'Enter'],
  flute: ['KeyF'],
  confirm: ['Enter', 'Space', 'KeyE', 'Mouse0'],
  cancel: ['Escape'],
  music: ['KeyP'],
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  note0: ['Digit1', 'Numpad1'],
  note1: ['Digit2', 'Numpad2'],
  note2: ['Digit3', 'Numpad3'],
  note3: ['Digit4', 'Numpad4'],
  note4: ['Digit5', 'Numpad5'],
};

/**
 * Standard gamepad mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start,
 * 12–15 d-pad up/down/left/right. A both talks and jumps: the game checks "interact" first.
 */
const PAD: Record<Action, number[]> = {
  attack: [2],
  shield: [7, 5],
  jump: [0],
  lock: [6, 4],
  interact: [0],
  flute: [3],
  confirm: [0, 9],
  cancel: [1],
  music: [8],
  menuUp: [12],
  menuDown: [13],
  note0: [0],
  note1: [13],
  note2: [15],
  note3: [14],
  note4: [12],
};

const KEY_GLYPH: Record<Action, string> = {
  attack: 'Click', shield: 'Shift', jump: 'Space', lock: 'Q', interact: 'E', flute: 'F',
  confirm: 'Enter', cancel: 'Esc', music: 'P', menuUp: 'W', menuDown: 'S',
  note0: '1', note1: '2', note2: '3', note3: '4', note4: '5',
};

const PAD_GLYPH: Record<Action, string> = {
  attack: 'X', shield: 'RT', jump: 'A', lock: 'LT', interact: 'A', flute: 'Y',
  confirm: 'A', cancel: 'B', music: 'Back', menuUp: '↑', menuDown: '↓',
  note0: 'A', note1: '↓', note2: '→', note3: '←', note4: '↑',
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
