import type * as THREE from 'three';
import type { Sfx } from '../core/audio';
import type { Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import type { AreaId } from '../content/areas';
import type { Area } from '../world/area';
import type { Enemy } from './enemies';
import type { Player } from './player';
import type { GameState } from './state';

export interface Page {
  /** Speaker name; omit for narration and item messages. */
  who?: string;
  /**
   * Text. `*word*` is highlighted and `[attack]` etc. show the button for an action on the
   * player's current device. `\n` breaks lines.
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
  /** Like `say`, but the last page ends in a choice list; resolves with the index picked. */
  ask(pages: Page[], options: string[]): Promise<number>;
  /**
   * A titled menu of options in a panel of its own (built on `MenuStack`); resolves with
   * the index chosen, or null if the player backs out. For lists, like the bells' travel
   * menu; a yes/no under a dialog line is `ask`.
   */
  choose(title: string, options: string[]): Promise<number | null>;
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
  /** Hides Wren (or shows her again): for a vision of a place she isn't standing in. */
  hidePlayer(hidden: boolean): void;
  /** Big area-name title. */
  showAreaName(name: string): void;
  /** A boss's name card. */
  showBossTitle(name: string, epithet: string): void;
  /** Slow motion (0.25) or normal speed (1). Remember to set it back. */
  setTimeScale(scale: number): void;
  /** Adds an enemy or boss to the current area. */
  addEnemy(e: Enemy): void;
  /** Takes an enemy out of the area at once (no death, no drop). */
  removeEnemy(e: Enemy): void;
  /** Starts another script once the current one (if any) has finished. */
  run(script: Script): void;
  toast(text: string): void;
  /** Fast-forwards the clock to an hour of the day (it runs indoors too while warping). */
  warpTime(toHour: number): void;
  /** Sends the player back to the area's start with full health. */
  respawn(): void;
  /** Stops the music (true) until called with false, when the area's theme starts over. */
  silenceMusic(on: boolean): void;
  /** Fades out, loads another area (at a named entrance, or its spawn) and fades back in; `quiet` skips the area-name card (a vision, a flashback). */
  travel(area: AreaId, entrance?: string, quiet?: boolean, arrive?: () => void): Promise<void>;
  giveSword(): void;
}

/** A story script or cutscene. While it runs, the player has no control. */
export type Script = (api: ScriptApi) => Promise<void>;
