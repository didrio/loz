import { G } from '../content/text/gear';
import { DEV_STATES } from '../content/devStates';
import { foundHints } from '../content/hints';
import { foundSigils } from '../content/sigils';
import { SENSITIVITY_RANGE, type Settings } from '../core/save';
import { LOOK, TONE_MAPS, type LookSettings } from '../render/experiments/modernLook';
import { BAKE, bakedLightOn, setBakedLight, setBakeStrength, type BakeProfile, type BakeStrength } from '../render/bakeLight';
import { DISPLAY_NAMES } from '../render/retro';
import { setTextureResolution, TEXTURE_RESOLUTION_RANGE, textureResolution } from '../render/textures';
import { gearRows } from './gearRows';
import type { Game } from './game';
import type { Menu, MenuRow } from './menu';
import { MenuDriver } from './menuDriver';
import { TRIAL_RULES } from './trialFalls';

/** Where the Dev tab's texture-resolution try-out is remembered (a tuning aid, not a setting). */
const RESOLUTION_KEY = 'embervale:dev:textureResolution';
/** Where the Dev tab's baked-light try-out (on/off and both profiles' strength) is remembered, the same way. */
const BAKE_KEY = 'embervale:dev:bakedLight';

function saveBake() {
  try { localStorage.setItem(BAKE_KEY, JSON.stringify({ on: bakedLightOn(), sky: BAKE.sky, indoor: BAKE.indoor })); } catch { /* not remembered */ }
}

function loadBake() {
  try {
    const saved = JSON.parse(localStorage.getItem(BAKE_KEY) ?? 'null') as { on?: boolean; sky?: Partial<BakeStrength>; indoor?: Partial<BakeStrength> } | null;
    if (!saved) return;
    if (saved.sky) setBakeStrength('sky', saved.sky);
    if (saved.indoor) setBakeStrength('indoor', saved.indoor);
    if (saved.on === false) setBakedLight(false);
  } catch { /* no storage or a bad entry: keep the defaults */ }
}

/** Where the Dev tab's look experiment (T62: render/experiments/modernLook.ts) is remembered, the same way. */
const LOOK_KEY = 'embervale:dev:lookExperiment';

function saveLook() {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(LOOK)); } catch { /* not remembered */ }
}

function loadLook() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as Partial<LookSettings> | null;
    if (!saved) return;
    for (const k of Object.keys(LOOK) as (keyof LookSettings)[]) {
      if (typeof saved[k] === typeof LOOK[k]) (LOOK as Record<string, unknown>)[k] = saved[k];
    }
  } catch { /* no storage or a bad entry: keep the defaults */ }
}

/** EXPERIMENT (T62): the look-direction comparison's switches. Not a setting; off by default. */
function lookRows(): MenuRow[] {
  const toggle = (label: string, key: 'barrels' | 'lighting' | 'smooth'): MenuRow => ({
    kind: 'toggle', label, get: () => LOOK[key], set: (on) => { LOOK[key] = on; saveLook(); },
  });
  const slider = (label: string, key: 'exposure' | 'sky' | 'ao' | 'bloom', max: number): MenuRow => ({
    kind: 'slider', label, min: 0, max, step: 0.05, format: (v) => v.toFixed(2), get: () => LOOK[key], set: (v) => { LOOK[key] = v; saveLook(); },
  });
  return [
    toggle('Barrels (today, modern, photoreal)', 'barrels'),
    toggle('Modern lighting (not in N64)', 'lighting'),
    toggle('Smooth shading', 'smooth'),
    { kind: 'choice', label: 'Tone mapping', space: true, options: TONE_MAPS, get: () => LOOK.toneMap, set: (i) => { LOOK.toneMap = i; saveLook(); } },
    slider('Exposure', 'exposure', 2),
    slider('Sky light', 'sky', 2),
    slider('Corner shade', 'ao', 1),
    slider('Bloom', 'bloom', 1),
  ];
}

/** The Dev tab's live strength sliders for one bake profile (render/bakeLight.ts): no rebuild, the colours recompose. */
function bakeSliders(profile: BakeProfile, name: string): MenuRow[] {
  const row = (key: keyof BakeStrength, label: string, max: number): MenuRow => ({
    kind: 'slider', label: `${name} ${label}`, min: 0, max, step: 0.05, format: (v) => v.toFixed(2),
    get: () => BAKE[profile][key],
    set: (v) => { setBakeStrength(profile, { [key]: v }); saveBake(); },
  });
  return [row('occlusion', 'occlusion', 2), row('floor', 'floor', 1), row('bleed', 'bleed', 1)];
}

type TabId = 'settings' | 'gear' | 'hints' | 'messages' | 'dev';

const TAB_LABEL: Record<TabId, string> = { settings: 'Settings', gear: G.tab, hints: 'Hints', messages: 'Messages', dev: 'Dev' };

/**
 * The pause menu (P / Start): the one menu, a row of tabs. Settings is always first, Gear second (read-only: what Wren carries); Hints
 * appears once Wren has found a keepers' note, Messages once she has read a sigil. More tabs
 * (gear, ...) are added to `tabs()` the same way, when there is something to look at. **Dev** is last (sprint, invincible, save states;
 * `Game.devTab`, which the Steam build turns off).
 * Left/right change a setting; Q/E / LB/RB switch tabs. P / Start close it; B / Backspace / Esc close it too.
 */
export class PauseMenu {
  readonly menu: MenuDriver;
  /** The tab shown last, so the menu reopens where the player left it. */
  private tab: TabId = 'settings';

  constructor(private readonly game: Game) {
    this.menu = new MenuDriver(game);
    this.menu.onTab = (dir) => this.step(dir);
    try {
      const saved = Number(localStorage.getItem(RESOLUTION_KEY));
      if (saved) setTextureResolution(saved);
    } catch { /* no storage (tests, private windows): keep the default */ }
    loadBake();
    loadLook();
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /** The tabs that exist right now, in order. */
  tabs(): TabId[] {
    const { state } = this.game;
    const tabs: TabId[] = ['settings', 'gear'];
    if (foundHints(state).length) tabs.push('hints');
    if (foundSigils(state).length) tabs.push('messages');
    if (this.game.devTab) tabs.push('dev');
    return tabs;
  }

  /**
   * One frame of input. Returns true while the menu is open, and on the frame it closes, so
   * the press that closed it doesn't also reach the game (Start is also "confirm").
   */
  update(): boolean {
    const { input } = this.game;
    if (!this.menu.isOpen) {
      if (this.game.mode !== 'play' || !input.pressed('pause')) return false;
      if (!this.tabs().includes(this.tab)) this.tab = 'settings';
      this.game.cutVoice();
      this.menu.open(this.page(this.tab));
    } else if (input.pressed('pause')) {
      this.menu.close();
    } else {
      this.menu.update();
    }
    return true;
  }

  /** Shows tab `i` (the mouse clicking a tab). */
  setTab(i: number) {
    const id = this.tabs()[i];
    if (!id || id === this.tab) return;
    this.tab = id;
    this.menu.replace(this.page(id));
  }

  private step(dir: -1 | 1) {
    const tabs = this.tabs();
    if (tabs.length > 1) this.setTab((tabs.indexOf(this.tab) + dir + tabs.length) % tabs.length);
  }

  private page(id: TabId): Menu {
    const tabs = this.tabs();
    const rows = id === 'settings' ? this.settingsRows() : id === 'gear' ? this.gearTab() : id === 'hints' ? this.hintRows() : id === 'dev' ? this.devRows() : this.messageRows();
    return { title: 'Paused', rows, tabs: { labels: tabs.map((t) => TAB_LABEL[t]), active: tabs.indexOf(id) } };
  }

  private settingsRows(): MenuRow[] {
    const { game } = this;
    const s = game.settings;
    const percent = (v: number) => `${Math.round(v * 100)}%`;
    const times = (v: number) => `${v.toFixed(1)}×`;
    const volume = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'voiceVolume', space = false): MenuRow => ({
      kind: 'slider', label, space, min: 0, max: 1, step: 0.05, get: () => s[key], set: (v) => this.change({ [key]: v }), format: percent,
    });
    const sensitivity = (label: string, key: 'mouseSensitivity' | 'stickSensitivity', space = false): MenuRow => ({
      kind: 'slider', label, space, ...SENSITIVITY_RANGE, step: 0.1, get: () => s[key], set: (v) => this.change({ [key]: v }), format: times,
    });
    const rows: MenuRow[] = [
      volume('Master volume', 'masterVolume'),
      volume('Music volume', 'musicVolume'),
      volume('Effects volume', 'sfxVolume'),
      volume('Voice volume', 'voiceVolume'),
      sensitivity('Mouse sensitivity', 'mouseSensitivity', true),
      sensitivity('Stick sensitivity', 'stickSensitivity'),
      { kind: 'toggle', label: 'Invert camera up/down', get: () => s.invertY, set: (on) => this.change({ invertY: on }) },
      { kind: 'choice', label: 'Display', space: true, options: DISPLAY_NAMES, get: () => s.display, set: (i) => this.change({ display: i as Settings['display'] }) },
      { kind: 'toggle', label: 'Shadows', get: () => s.shadows, set: (on) => this.change({ shadows: on }) },
    ];
    if (game.canFullscreen) {
      rows.push({ kind: 'toggle', label: 'Fullscreen', get: () => game.isFullscreen, set: (on) => game.setFullscreen(on) });
    }
    return rows;
  }

  /** Testing tools: toggles, then ready-made save states in the order the game is played (loading one replaces the save). */
  private devRows(): MenuRow[] {
    const { game } = this;
    const { player, state } = game;
    const states: MenuRow[] = DEV_STATES.map((s, i) => ({
      kind: 'action' as const,
      label: s.name,
      group: i === 0 ? 'Save states' : undefined,
      run: () => {
        this.menu.close();
        game.loadDevState(s);
        game.hud.showToast(`Loaded: ${s.name}`);
      },
    }));
    return [
      { kind: 'toggle', label: 'Dev sprint (x5)', get: () => player.devSpeed !== 1, set: (on) => (player.devSpeed = on ? 5 : 1) },
      { kind: 'toggle', label: 'Invincible', get: () => state.invincible, set: (on) => (state.invincible = on) },
      {
        kind: 'slider', label: 'Texture resolution', ...TEXTURE_RESOLUTION_RANGE, step: 1, get: textureResolution, format: (v) => `${v} / m`,
        set: (v) => {
          setTextureResolution(v);
          try { localStorage.setItem(RESOLUTION_KEY, String(textureResolution())); } catch { /* not remembered */ }
        },
      },
      { kind: 'toggle', label: 'Baked light', get: bakedLightOn, set: (on) => { setBakedLight(on); saveBake(); } },
      ...bakeSliders('sky', 'Outdoor'),
      ...bakeSliders('indoor', 'Indoor'),
      { kind: 'submenu', label: 'Look experiment (T62)', menu: () => ({ title: 'Look experiment', rows: lookRows() }) },
      { kind: 'toggle', label: 'Trial falls cost a half heart', get: () => TRIAL_RULES.fallDamage > 0, set: (on) => (TRIAL_RULES.fallDamage = on ? 1 : 0) },
      ...states,
    ];
  }

  private gearTab(): MenuRow[] {
    const rows = gearRows(this.game.state, (id) => this.game.icons.get(id));
    return rows.length ? rows : [{ kind: 'entry', label: G.empty, detail: '' }];
  }

  private change(patch: Partial<Settings>) {
    this.game.changeSettings(patch);
  }

  private hintRows(): MenuRow[] {
    return foundHints(this.game.state).map((h) => ({ kind: 'entry' as const, label: h.title, detail: h.text.replace(/\*/g, '') }));
  }

  /** The sigils Wren has read, in the order they were written. */
  private messageRows(): MenuRow[] {
    return foundSigils(this.game.state).map((g) => ({ kind: 'entry' as const, label: g.title, detail: g.text.join('\n') }));
  }
}
