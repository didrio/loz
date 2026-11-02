import type * as THREE from 'three';
import type { Sfx } from '../core/audio';
import type { Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import type { Area } from '../world/area';
import type { Enemy } from './enemies';
import type { Player } from './player';
import type { GameState } from './state';

export interface Page {
  /** Speaker name; omit for narration and item messages. */
  who?: string;
  /**
   * Text. `*word*` is highlighted, `{0}`–`{4}` show flute note buttons and `[attack]` etc.
   * show the button for an action on the player's current device. `\n` breaks lines.
   */
  text: string;
}

/**
 * What story scripts and cutscenes can do. Content code (`src/content/`) only talks to the
 * game through this, so writing new scenes never means touching engine code.
 */
export interface ScriptApi {
  readonly state: GameState;
  readonly sfx: Sfx;
  readonly player: Player;
  readonly particles: Particles;
  readonly area: Area;
  readonly physics: Physics;

  /** Shows dialog pages; resolves when the player has read the last one. */
  say(pages: Page[]): Promise<void>;
  /** Waits for game time to pass. */
  wait(seconds: number): Promise<void>;
  /** Waits until a condition holds (checked once per frame). */
  until(test: () => boolean): Promise<void>;
  /** Fades the screen to black (1) or back (0). */
  fade(to: number, seconds: number): Promise<void>;
  /** Full-screen title card; resolves when the player confirms. */
  card(title: string, subtitle: string): Promise<void>;
  /** Calls `fn(progress)` every frame with progress 0 → 1 over `seconds` (custom animation). */
  tween(seconds: number, fn: (p: number) => void): Promise<void>;
  /**
   * Moves the camera to look at something until `releaseCamera()` (or the script ends).
   * Call again to retarget (it glides there), or pass `cut` to jump.
   */
  shot(from: THREE.Vector3, lookAt: THREE.Vector3, cut?: boolean): void;
  releaseCamera(): void;
  /** Big area-name title. */
  showAreaName(name: string): void;
  /** A boss's name card. */
  showBossTitle(name: string, epithet: string): void;
  /** Slow motion (0.25) or normal speed (1). Remember to set it back. */
  setTimeScale(scale: number): void;
  /** Adds an enemy or boss to the current area. */
  addEnemy(e: Enemy): void;
  /** Starts another script once the current one (if any) has finished. */
  run(script: Script): void;
  toast(text: string): void;
  /** Fast-forwards the clock to an hour of the day. */
  warpTime(toHour: number): void;
  /** Sends the player back to the area's start with full health. */
  respawn(): void;
  giveSword(): void;
}

/** A story script or cutscene. While it runs, the player has no control. */
export type Script = (api: ScriptApi) => Promise<void>;
