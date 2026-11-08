import { DEV_STATES } from '../content/devStates';
import { foundHints } from '../content/hints';
import { foundSigils } from '../content/sigils';
import { SENSITIVITY_RANGE, type Settings } from '../core/save';
import { bakedLightOn, setBakedLight } from '../render/bakeLight';
import { DISPLAY_NAMES } from '../render/retro';
import { setTextureResolution, TEXTURE_RESOLUTION_RANGE, textureResolution } from '../render/textures';
import type { Game } from './game';
import type { Menu, MenuRow } from './menu';
import { MenuDriver } from './menuDriver';
import { TRIAL_RULES } from './trialFalls';

/** Where the Dev tab's texture-resolution try-out is remembered (a tuning aid, not a setting). */
const RESOLUTION_KEY = 'embervale:dev:textureResolution';

type TabId = 'settings' | 'hints' | 'messages' | 'dev';

const TAB_LABEL: Record<TabId, string> = { settings: 'Settings', hints: 'Hints', messages: 'Messages', dev: 'Dev' };

/**
 * The pause menu (P / Start): the one menu, a row of tabs. Settings is always first; Hints
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
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /** The tabs that exist right now, in order. */
  tabs(): TabId[] {
    const { state } = this.game;
    const tabs: TabId[] = ['settings'];
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
    const rows = id === 'settings' ? this.settingsRows() : id === 'hints' ? this.hintRows() : id === 'dev' ? this.devRows() : this.messageRows();
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
      space: i === 0,
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
      { kind: 'toggle', label: 'Baked light (village test)', get: bakedLightOn, set: setBakedLight },
      { kind: 'toggle', label: 'Trial falls cost a half heart', get: () => TRIAL_RULES.fallDamage > 0, set: (on) => (TRIAL_RULES.fallDamage = on ? 1 : 0) },
      ...states,
    ];
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
