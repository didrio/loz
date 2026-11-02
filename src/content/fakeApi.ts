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
  const travels: { area: AreaId; entrance?: string }[] = [];
  const noop = () => {};
  const pushes: THREE.Vector3[] = [];
  const player = { pos: new THREE.Vector3(), teleport: noop, setSword: noop, push: (from: THREE.Vector3) => void pushes.push(from.clone()) } as unknown as Player;
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
    wait: async () => {},
    until: async () => {},
    fade: async () => {},
    card: async () => {},
    shot: noop,
    releaseCamera: noop,
    showAreaName: noop,
    toast: noop,
    warpTime: noop,
    respawn: noop,
    giveSword: () => state.set('hasSword'),
    silenceMusic: noop,
    travel: async (a, entrance) => void travels.push({ area: a, entrance }),
  };
  /** Runs (and empties) the scripts that were queued with `api.run`. */
  const runQueued = async () => {
    while (queued.length) await queued.shift()!(api);
  };
  return { api, said, state, queued, runQueued, enemies, travels, player, pushes };
}
