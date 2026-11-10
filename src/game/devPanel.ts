import { DEV_STATES } from '../content/devStates';
import { BAKE, BAKE_DEFAULTS, bakedLightOn, setBakedLight, setBakeStrength, type BakeProfile, type BakeStrength } from '../render/bakeLight';
import { AA_NAMES, BARREL_SWITCH, LOOK, TONE_MAPS } from '../render/experiments/modernLook';
import { DEFAULT_TEXTURE_RESOLUTION, setTextureResolution, TEXTURE_RESOLUTION_RANGE, textureResolution } from '../render/textures';
import type { Game } from './game';
import { changedSummary, resetRow, type Menu, type MenuRow } from './menu';
import { MenuDriver } from './menuDriver';
import { TRIAL_RULES } from './trialFalls';

/** The look experiment's starting values (T62), taken before anything can change them. */
const LOOK_DEFAULTS = { ...LOOK };
const TRIAL_FALLS_HURT = TRIAL_RULES.fallDamage > 0;

/** The look experiment's switches and sliders (T62), under one heading. */
function lookRows(): MenuRow[] {
  type Switch = 'lighting' | 'smooth' | (typeof BARREL_SWITCH)[keyof typeof BARREL_SWITCH][0];
  const toggle = (label: string, key: Switch): MenuRow => ({
    kind: 'toggle', label, def: LOOK_DEFAULTS[key], get: () => LOOK[key], set: (on) => { LOOK[key] = on; },
  });
  const slider = (label: string, key: 'exposure' | 'sky' | 'ao' | 'bloom' | 'contrast' | 'saturation' | 'gamma' | 'highlights', max: number, min = 0): MenuRow => ({
    kind: 'slider', label, def: LOOK_DEFAULTS[key], min, max, step: 0.05, format: (v) => v.toFixed(2), get: () => LOOK[key], set: (v) => { LOOK[key] = v; },
  });
  const rows: MenuRow[] = [
    ...Object.values(BARREL_SWITCH).map(([key, label]) => toggle(label, key)),
    toggle('Modern lighting', 'lighting'),
    toggle('Smooth shading', 'smooth'),
    { kind: 'choice', label: 'Anti-aliasing (modern)', def: LOOK_DEFAULTS.aa, options: AA_NAMES, get: () => LOOK.aa, set: (i) => { LOOK.aa = i; } },
    { kind: 'choice', label: 'Highlight curve', def: LOOK_DEFAULTS.toneMap, options: TONE_MAPS, get: () => LOOK.toneMap, set: (i) => { LOOK.toneMap = i; } },
    slider('Exposure', 'exposure', 4),
    slider('Gamma', 'gamma', 2, 0.4),
    slider('Highlights', 'highlights', 1, -1),
    slider('Contrast', 'contrast', 2),
    slider('Saturation', 'saturation', 2),
    slider('Sky light', 'sky', 2),
    slider('Corner shade', 'ao', 1),
    slider('Bloom', 'bloom', 1),
  ];
  rows[0] = { ...rows[0], group: 'Look experiment' };
  return rows;
}

/** Live strength sliders for one bake profile (render/bakeLight.ts): no rebuild, the colours recompose. */
function bakeSliders(profile: BakeProfile, name: string): MenuRow[] {
  const row = (key: keyof BakeStrength, label: string, max: number): MenuRow => ({
    kind: 'slider', label: `${name} ${label}`, def: BAKE_DEFAULTS[profile][key], min: 0, max, step: 0.05, format: (v) => v.toFixed(2),
    get: () => BAKE[profile][key],
    set: (v) => setBakeStrength(profile, { [key]: v }),
  });
  return [row('occlusion', 'occlusion', 2), row('floor', 'floor', 1), row('bleed', 'bleed', 1)];
}

type Value = number | boolean;
const read = (r: MenuRow): Value => (r.kind === 'toggle' || r.kind === 'slider' || r.kind === 'choice' ? r.get() : 0);
const write = (r: MenuRow, v: Value) => {
  if (read(r) === v) return; // setting a texture resolution to what it is would rebuild every texture for nothing
  if (r.kind === 'toggle') r.set(!!v);
  else if (r.kind === 'slider' || r.kind === 'choice') r.set(Number(v));
};

/**
 * The dev panel (backtick / left-stick click; `Game.devTab`, which the Steam build turns off): every dev control in one plain,
 * see-through list down the right edge. The game stands still behind it, a drag turns the camera, Tab / Y held hides it, so a change
 * can be judged against the live scene. Sprint, invincible, the texture resolution, baked light, the look experiment, trial rules, a
 * "copy values" action (to paste to an agent) and the ready-made save states. Every setting has a reset button.
 *
 * **Only a page load resets anything here** (owner's call, 2026-11-09): nothing is saved, and tweaks survive closing the panel, a new
 * game, Continue and the save states. The defaults change only in code.
 *
 * **Default** (a switch pinned under the list): while it is on, every visual setting (rendering and look: `tuning`) is the code's
 * default, both shown and used, and those rows are locked, whatever else happens, until it is switched off (the tweaks come back) or
 * the page reloads. Right after a load it changes nothing, since nothing has been tweaked yet.
 */
export class DevPanel {
  readonly menu: MenuDriver;
  /** The Default switch. */
  private showDefaults = false;
  /** The visual settings the Default switch is hiding (the owner's tweaks), while it is on. */
  private hidden: Value[] | null = null;

  constructor(private readonly game: Game) {
    this.menu = new MenuDriver({ input: game.input, sfx: game.sfx, hud: { setMenu: (v) => game.hud.setDevMenu(v) } });
  }

  get isOpen() {
    return this.menu.isOpen;
  }

  /** One frame of input. Returns true while the panel is open, and on the frame it closes (so the press doesn't reach the game). */
  update(): boolean {
    const { game } = this;
    const { input } = game;
    if (!this.menu.isOpen) {
      if (!game.devTab || game.mode !== 'play' || game.pauseMenu.isOpen || game.choice.isOpen || !input.pressed('devMenu')) return false;
      game.cutVoice();
      this.menu.open(this.page());
    } else if (input.pressed('devMenu')) {
      this.menu.close();
    } else {
      const peek = input.held('hideMenu');
      this.menu.setPeek(peek);
      if (!peek) this.menu.update();
    }
    return true;
  }

  /** The gameplay switches, and the visual settings (rendering and look) that the Default switch covers and locks. */
  private rows(): { play: MenuRow[]; tuning: MenuRow[] } {
    const { game } = this;
    const { player, state } = game;
    const play: MenuRow[] = [
      { kind: 'toggle', label: 'Dev sprint (x5)', def: false, get: () => player.devSpeed !== 1, set: (on) => (player.devSpeed = on ? 5 : 1) },
      { kind: 'toggle', label: 'Performance meter', def: game.perfByDefault, get: () => game.showPerf, set: (on) => (game.showPerf = on) },
      { kind: 'toggle', label: 'Invincible', def: false, get: () => state.invincible, set: (on) => (state.invincible = on) },
      { kind: 'toggle', label: 'Trial falls hurt', def: TRIAL_FALLS_HURT, get: () => TRIAL_RULES.fallDamage > 0, set: (on) => (TRIAL_RULES.fallDamage = on ? 1 : 0) },
    ];
    const tuning: MenuRow[] = [
      { kind: 'slider', label: 'Texture resolution', group: 'Rendering', def: DEFAULT_TEXTURE_RESOLUTION, ...TEXTURE_RESOLUTION_RANGE, step: 1, get: textureResolution, format: (v) => `${v} / m`, set: setTextureResolution },
      { kind: 'toggle', label: 'Baked light', def: true, get: bakedLightOn, set: (on) => setBakedLight(on) },
      ...bakeSliders('sky', 'Outdoor'),
      ...bakeSliders('indoor', 'Indoor'),
      ...lookRows(),
    ];
    return { play, tuning: tuning.map((r) => ({ ...r, locked: () => this.showDefaults }) as MenuRow) };
  }

  private page(): Menu {
    const { game } = this;
    const { play, tuning } = this.rows();
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
    const copy: MenuRow = { kind: 'action', label: 'Copy values', group: 'Tools', run: () => this.copyValues([...game.pauseMenu.settingsRows(), ...play], tuning) };
    const perf: MenuRow = { kind: 'action', label: 'Copy performance', run: () => this.copyText(game.performanceReport(), 'Performance copied') };
    const defaults: MenuRow = { kind: 'toggle', label: 'Default', pinned: true, get: () => this.showDefaults, set: (on) => this.setShowDefaults(on) };
    return { title: 'Dev', rows: [...play, ...tuning, copy, perf, ...states, defaults] };
  }

  /** The Default switch: on puts every visual setting at the code's default (keeping the tweaks aside); off brings the tweaks back. */
  private setShowDefaults(on: boolean) {
    if (on === this.showDefaults) return;
    const { tuning } = this.rows();
    if (on) {
      this.hidden = tuning.map(read);
      this.showDefaults = true;
      for (const r of tuning) resetRow(r); // the rows are locked to the player, not to this
    } else {
      this.showDefaults = false;
      const hidden = this.hidden ?? tuning.map(read);
      tuning.forEach((r, i) => write(r, hidden[i]));
      this.hidden = null;
    }
  }

  /** The rows that are away from their defaults, as text ("" for none): the performance report carries it, so a number can be tied to a setting. */
  changedText(): string {
    const { play, tuning } = this.rows();
    const changed = changedSummary([...this.game.pauseMenu.settingsRows(), ...play, ...tuning]);
    return this.showDefaults ? `(Default is on: the visual settings are the defaults)${changed ? `\n${changed}` : ''}` : changed;
  }

  /**
   * Copies only what is changed from the defaults (and where and when, since the look depends on it), as text to paste to an agent, and
   * says so. With Default on, the visual rows report the tweaks it is hiding: those are what the owner wants to hand over.
   */
  private copyValues(rows: MenuRow[], tuning: MenuRow[]) {
    const { game } = this;
    const h = Math.floor(game.state.hours) % 24;
    const m = Math.floor((game.state.hours % 1) * 60);
    const hidden = this.hidden;
    const visual = hidden ? tuning.map((r, i) => ({ ...r, get: () => hidden[i] }) as MenuRow) : tuning;
    const changed = changedSummary([...rows, ...visual]);
    this.copyText(
      `Settings in ${game.area.id} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${hidden ? ' (Default is on; these are the tweaks it is hiding)' : ''}.\nChanged from the defaults:\n${changed || '(nothing)'}`,
      'Values copied',
    );
  }

  private copyText(text: string, done: string) {
    const ok = () => this.game.hud.showToast(done);
    const fail = () => this.game.hud.showToast('Could not copy');
    try {
      navigator.clipboard.writeText(text).then(ok, fail);
    } catch {
      fail();
    }
  }
}
