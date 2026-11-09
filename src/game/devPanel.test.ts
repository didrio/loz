import { describe, expect, it } from 'vitest';
import type { Action } from '../core/input';
import { LOOK } from '../render/experiments/modernLook';
import { DevPanel } from './devPanel';
import type { Game } from './game';
import type { MenuView } from './menu';

/** A stand-in game: just what the panel reads. */
function setup() {
  const down = new Set<Action>();
  let view: MenuView | null = null;
  const game = {
    input: { pressed: (a: Action) => down.has(a), held: () => false },
    sfx: { init: () => {}, select: () => {} },
    hud: { setDevMenu: (v: MenuView | null) => (view = v), showToast: () => {} },
    devTab: true,
    showPerf: true,
    perfByDefault: true,
    mode: 'play',
    pauseMenu: { isOpen: false, settingsRows: () => [] },
    choice: { isOpen: false },
    cutVoice: () => {},
    loadDevState: () => {},
    player: { devSpeed: 1 },
    state: { invincible: false },
  };
  const panel = new DevPanel(game as unknown as Game);
  /** One frame with these actions pressed. */
  const frame = (...a: Action[]) => {
    down.clear();
    for (const x of a) down.add(x);
    return panel.update();
  };
  const row = (label: string) => view!.rows.findIndex((r) => r.label === label);
  return { panel, frame, row, view: () => view! };
}

describe('the dev panel', () => {
  it('opens on the backtick key and closes on it, swallowing the press', () => {
    const { panel, frame } = setup();
    expect(frame()).toBe(false);
    expect(frame('devMenu')).toBe(true);
    expect(panel.isOpen).toBe(true);
    expect(frame('devMenu')).toBe(true);
    expect(panel.isOpen).toBe(false);
    expect(frame()).toBe(false);
  });

  it('pins the Default switch as the last row, off', () => {
    const { frame, view } = setup();
    frame('devMenu');
    const last = view().rows[view().rows.length - 1];
    expect(last).toMatchObject({ label: 'Default', pinned: true, kind: 'toggle', on: false });
  });

  it('Default shows and uses the defaults and locks the visual rows, whatever happens, until it goes off and the tweaks come back', () => {
    const { panel, frame, row, view } = setup();
    const was = { ...LOOK };
    try {
      frame('devMenu');
      const exposure = row('Exposure');
      panel.menu.adjust(exposure, 1);
      panel.menu.adjust(exposure, 1);
      expect(LOOK.exposure).toBeCloseTo(1.1); // a tweak
      panel.menu.click(row('Default')); // on
      expect(LOOK.exposure).toBe(1);
      expect(view().rows[exposure]).toMatchObject({ locked: true, value: '1.00' });
      panel.menu.adjust(exposure, 1); // ignored while it is on
      panel.menu.reset(exposure);
      expect(LOOK.exposure).toBe(1);
      expect(view().rows[row('Dev sprint (x5)')].locked).toBeUndefined(); // gameplay rows stay free
      frame('devMenu'); // close and reopen: still on, still the defaults
      frame();
      frame('devMenu');
      expect(view().rows[row('Default')].on).toBe(true);
      expect(LOOK.exposure).toBe(1);
      panel.menu.click(row('Default')); // off: the tweak is back
      expect(LOOK.exposure).toBeCloseTo(1.1);
      expect(view().rows[row('Exposure')].locked).toBeUndefined();
    } finally {
      Object.assign(LOOK, was);
    }
  });

  it('keeps tweaks when the panel closes (only a page load resets them)', () => {
    const { panel, frame, row } = setup();
    const was = { ...LOOK };
    try {
      frame('devMenu');
      panel.menu.adjust(row('Exposure'), 1);
      frame('devMenu');
      frame();
      expect(LOOK.exposure).toBeCloseTo(1.05);
    } finally {
      Object.assign(LOOK, was);
    }
  });
});
