import { G } from '../content/text/gear';
import { foundHints } from '../content/hints';
import { foundSigils } from '../content/sigils';
import { SENSITIVITY_RANGE, type Settings } from '../core/save';
import { DISPLAY_NAMES, DISPLAY_ORDER } from '../render/retro';
import { gearRows } from './gearRows';
import type { Game } from './game';
import type { Menu, MenuRow } from './menu';
import { MenuDriver } from './menuDriver';

type TabId = 'settings' | 'gear' | 'hints' | 'messages';

const TAB_LABEL: Record<TabId, string> = { settings: 'Settings', gear: G.tab, hints: 'Hints', messages: 'Messages' };

/**
 * The pause menu (P / Start): the one menu, a row of tabs. Settings is always first, Gear second (read-only: what Wren carries); Hints
 * appears once Wren has found a keepers' note, Messages once she has read a sigil. More tabs
 * are added to `tabs()` the same way, when there is something to look at. The dev tools are not a tab: they have their own panel (`devPanel.ts`).
 * Left/right change a setting; Q/E / LB/RB switch tabs. P / Start close it; B / Backspace / Esc close it too.
 */
export class PauseMenu {
  readonly menu: MenuDriver;
  /** The tab shown last, so the menu reopens where the player left it. */
  private tab: TabId = 'settings';

  constructor(private readonly game: Game) {
    this.menu = new MenuDriver(game);
    this.menu.onTab = (dir) => this.step(dir);
    game.hud.onMenuPeek = (on) => (this.touchPeek = on);
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /** Opens the menu on the next frame of play (the game was sent to the background: it comes back paused). */
  openSoon() {
    this.openAsked = true;
  }

  private openAsked = false;

  /** The hide button on the screen (touch) is held. */
  touchPeek = false;

  /** The menu is out of the way (a visual row selected, or hidden): the camera may orbit Wren. */
  get liveView() {
    return this.menu.isOpen && this.menu.liveView;
  }

  /** The tabs that exist right now, in order. */
  tabs(): TabId[] {
    const { state } = this.game;
    const tabs: TabId[] = ['settings', 'gear'];
    if (foundHints(state).length) tabs.push('hints');
    if (foundSigils(state).length) tabs.push('messages');
    return tabs;
  }

  /**
   * One frame of input. Returns true while the menu is open, and on the frame it closes, so
   * the press that closed it doesn't also reach the game (Start is also "confirm").
   */
  update(): boolean {
    const { input } = this.game;
    if (!this.menu.isOpen) {
      const asked = this.openAsked;
      this.openAsked = false;
      if (this.game.mode !== 'play' || !(input.pressed('pause') || asked)) return false;
      if (!this.tabs().includes(this.tab)) this.tab = 'settings';
      this.game.cutVoice();
      this.menu.open(this.page(this.tab));
    } else if (input.pressed('pause')) {
      this.menu.close();
    } else {
      const peek = input.held('hideMenu') || this.touchPeek;
      this.menu.setPeek(peek);
      if (!peek) this.menu.update();
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
    const rows = id === 'settings' ? this.settingsRows() : id === 'gear' ? this.gearTab() : id === 'hints' ? this.hintRows() : this.messageRows();
    return { title: 'Paused', rows, tabs: { labels: tabs.map((t) => TAB_LABEL[t]), active: tabs.indexOf(id) } };
  }

  /** The Settings tab's rows (also read by the dev panel's copy action). */
  settingsRows(): MenuRow[] {
    const { game } = this;
    const s = game.settings;
    const percent = (v: number) => `${Math.round(v * 100)}%`;
    const times = (v: number) => `${v.toFixed(1)}×`;
    const d = game.defaultSettings;
    const volume = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'voiceVolume', space = false): MenuRow => ({
      kind: 'slider', label, space, def: d[key], min: 0, max: 1, step: 0.05, get: () => s[key], set: (v) => this.change({ [key]: v }), format: percent,
    });
    const sensitivity = (label: string, key: 'mouseSensitivity' | 'stickSensitivity', space = false): MenuRow => ({
      kind: 'slider', label, space, def: d[key], ...SENSITIVITY_RANGE, step: 0.1, get: () => s[key], set: (v) => this.change({ [key]: v }), format: times,
    });
    const rows: MenuRow[] = [
      volume('Master volume', 'masterVolume'),
      volume('Music volume', 'musicVolume'),
      volume('Effects volume', 'sfxVolume'),
      volume('Voice volume', 'voiceVolume'),
      sensitivity('Mouse sensitivity', 'mouseSensitivity', true),
      sensitivity('Stick sensitivity', 'stickSensitivity'),
      { kind: 'toggle', label: 'Invert camera up/down', def: d.invertY, get: () => s.invertY, set: (on) => this.change({ invertY: on }) },
      {
        kind: 'choice', label: 'Display', space: true, def: DISPLAY_ORDER.indexOf(d.display), options: DISPLAY_ORDER.map((m) => DISPLAY_NAMES[m]),
        get: () => DISPLAY_ORDER.indexOf(s.display), set: (i) => this.change({ display: DISPLAY_ORDER[i] }),
      },
      { kind: 'toggle', label: 'Shadows', def: d.shadows, get: () => s.shadows, set: (on) => this.change({ shadows: on }) },
    ];
    if (game.haptics.supported) {
      rows.push({ kind: 'toggle', label: 'Vibration', def: d.haptics, get: () => s.haptics, set: (on) => this.change({ haptics: on }) });
    }
    if (game.canFullscreen) {
      rows.push({ kind: 'toggle', label: 'Fullscreen', get: () => game.isFullscreen, set: (on) => game.setFullscreen(on) });
    }
    return rows;
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
