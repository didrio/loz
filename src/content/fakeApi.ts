import * as THREE from 'three';
import type { Sfx } from '../core/audio';
import type { Physics } from '../core/physics';
import type { Enemy } from '../game/enemies';
import type { Player } from '../game/player';
import type { Page, Script, ScriptApi } from '../game/script';
import { GameState } from '../game/state';
import type { Particles } from '../render/particles';
import type { Area } from '../world/area';
import type { AreaId } from './areas';

/**
 * A `ScriptApi` for content tests: everything resolves instantly, and what scripts do is
 * recorded (what was said, scripts queued with `run`, enemies added, travel). Tests drive
 * the real area and content code against it, in Node, without a browser.
 */
export function fakeApi(area: Area, physics: Physics, state = new GameState()) {
  const said: Page[] = [];
  const queued: Script[] = [];
  const enemies: Enemy[] = [];
  /** Answers `ask` will give, in order (default: the first option). */
  const answers: number[] = [];
  const asked: { pages: Page[]; options: string[] }[] = [];
  /** Answers `choose` will give, in order (default: null, backing out). */
  const choices: (number | null)[] = [];
  const chosen: { title: string; options: string[] }[] = [];
  const travels: { area: AreaId; entrance?: string }[] = [];
  /** Every `silenceMusic` call, in order. */
  const music: boolean[] = [];
  /** Every `hidePlayer` call, in order. */
  const hidden: boolean[] = [];
  /** Every toast shown, in order. */
  const toasts: string[] = [];
  const noop = () => {};
  const pushes: THREE.Vector3[] = [];
  const player = { pos: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), teleport: noop, setSword: noop, setShield: noop, setStoneward: noop, push: (from: THREE.Vector3) => void pushes.push(from.clone()) } as unknown as Player;
  const sfx = new Proxy({}, { get: () => noop }) as Sfx;
  const api: ScriptApi = {
    state, sfx, player, area,
    particles: { burst: noop } as unknown as Particles,
    physics,
    tween: async () => {},
    showBossTitle: noop,
    setTimeScale: noop,
    addEnemy: (e) => void enemies.push(e),
    removeEnemy: (e) => void enemies.splice(enemies.indexOf(e), 1),
    run: (s) => void queued.push(s),
    say: async (pages) => void said.push(...pages),
    ask: async (pages, options) => {
      said.push(...pages);
      asked.push({ pages, options });
      return answers.shift() ?? 0;
    },
    choose: async (title, options) => {
      chosen.push({ title, options });
      return choices.length ? choices.shift()! : null;
    },
    wait: async () => {},
    until: async () => {},
    fade: async () => {},
    card: async () => {},
    shot: noop,
    releaseCamera: noop,
    hidePlayer: (on) => void hidden.push(on),
    showAreaName: noop,
    toast: (t) => void toasts.push(t),
    warpTime: (h) => {
      if (h <= state.hours) state.day++;
      state.hours = h;
    },
    respawn: noop,
    giveSword: () => state.set('hasSword'),
    giveShield: () => state.set('hasShield'),
    silenceMusic: (on) => void music.push(on),
    travel: async (a, entrance, _quiet, arrive) => {
      travels.push({ area: a, entrance });
      arrive?.();
    },
  };
  /** Runs (and empties) the scripts that were queued with `api.run`. */
  const runQueued = async () => {
    while (queued.length) await queued.shift()!(api);
  };
  return { api, answers, asked, choices, chosen, said, state, queued, runQueued, enemies, travels, player, pushes, music, hidden, toasts };
}
