import * as THREE from 'three';

/**
 * Trial rules (bell trials, see docs/bells.md). Falling costs `fallDamage` half-hearts (1: owner's call,
 * 2026-11-03, after first trying it free); the dev menu can switch it off.
 */
export const TRIAL_RULES = { fallDamage: 1 };

/** A ledge that remembers Wren: standing on it makes it the place a fall returns to. World space. */
export interface Checkpoint {
  x: number;
  z: number;
  /** Half the ledge's width (x) and depth (z). */
  hw: number;
  hd: number;
  top: number;
}

/** What `recover` needs from the script API. */
export interface FallApi {
  sfx: { hurt(): void };
  state: { damage(n: number): void };
  player: { teleport(x: number, y: number, z: number): void; invuln: number };
  fade(to: number, seconds: number): Promise<void>;
}

/**
 * The fall rule of a bell trial: Wren remembers the last checkpoint ledge she stood on, and
 * dropping below `fallY` (or into a trial room's pit) fades out and puts her back there.
 * Enemy hits still hurt; the fall itself costs `TRIAL_RULES.fallDamage`.
 */
export class TrialFalls {
  private last = new THREE.Vector3();
  private busy = false;

  constructor(
    private readonly checkpoints: readonly Checkpoint[],
    readonly fallY: number,
    start: THREE.Vector3,
  ) {
    this.last.copy(start);
  }

  /** Where a fall returns to right now. */
  get checkpoint() {
    return this.last;
  }

  get falling() {
    return this.busy;
  }

  /** Make (x, y, z) the place a fall returns to (ground that isn't a ledge: the water's dry shore). */
  mark(x: number, y: number, z: number) {
    this.last.set(x, y, z);
  }

  /** Call every frame. Returns true on the frame a fall begins (then call `recover`). */
  check(pos: THREE.Vector3, grounded: boolean, inPit = false): boolean {
    if (this.busy) return false;
    if (grounded) {
      for (const c of this.checkpoints) {
        if (Math.abs(pos.x - c.x) <= c.hw && Math.abs(pos.z - c.z) <= c.hd && Math.abs(pos.y - c.top) < 0.3) {
          this.last.set(pos.x, c.top, pos.z);
          break;
        }
      }
    }
    if (pos.y < this.fallY || inPit) {
      this.busy = true;
      return true;
    }
    return false;
  }

  /** Fade out, back on the checkpoint (hearts only if the rule says so), fade in. */
  async recover(api: FallApi) {
    api.sfx.hurt();
    if (TRIAL_RULES.fallDamage > 0) api.state.damage(TRIAL_RULES.fallDamage);
    await api.fade(1, 0.25);
    api.player.teleport(this.last.x, this.last.y + 0.05, this.last.z);
    api.player.invuln = 1;
    await api.fade(0, 0.3);
    this.busy = false;
  }
}
