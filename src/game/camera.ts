import * as THREE from 'three';
import { angleDiff, clamp, damp, lerpAngle } from '../core/math';
import { Layer, type Physics } from '../core/physics';

const MIN_PITCH = -0.15;
const MAX_PITCH = 1.1;

/**
 * Third-person orbit camera. Turned by the player (mouse, right stick, arrows); when locked
 * on it swings behind the player and frames the target. It pulls in when a wall or the
 * ground gets between it and the player. Scripts can take it over with `shot()`.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  dist = 9;
  private focus = new THREE.Vector3();
  private recenterTo: number | null = null;
  private currentDist = 9;
  private shotFrom: THREE.Vector3 | null = null;
  private shotLook = new THREE.Vector3();
  private lookNow = new THREE.Vector3();
  private shakeAmt = 0;
  private shakeT = 0;
  /** Debug/look scripts only: leave the camera wherever it was put (e.g. a top-down map view). */
  frozen = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private physics: Physics) {}

  /** Swing behind the player (tapping lock-on with nothing to lock onto). */
  recenter(facing: number) {
    this.recenterTo = facing + Math.PI;
  }

  /** Jump straight behind the player (spawns, respawns). */
  snap(playerPos: THREE.Vector3, facing: number) {
    this.yaw = facing + Math.PI;
    this.focus.copy(playerPos).setY(playerPos.y + 1.6);
    this.currentDist = this.dist;
  }

  /** Takes over the camera. `cut` jumps straight there instead of gliding. */
  shot(from: THREE.Vector3, lookAt: THREE.Vector3, cut = false) {
    if (!this.shotFrom) this.lookNow.copy(this.focus);
    this.shotFrom = from.clone();
    this.shotLook.copy(lookAt);
    if (cut) {
      this.camera.position.copy(from);
      this.lookNow.copy(lookAt);
    }
  }

  /** Rattles the camera (slams, roars); decays on its own. */
  shake(strength: number) {
    this.shakeAmt = Math.max(this.shakeAmt, strength);
  }

  private applyShake(dt: number) {
    if (this.shakeAmt <= 0.001) return;
    this.shakeT += dt * 40;
    const a = this.shakeAmt * 0.35;
    this.camera.position.x += Math.sin(this.shakeT * 1.3) * a;
    this.camera.position.y += Math.sin(this.shakeT * 1.7 + 1) * a;
    this.camera.position.z += Math.cos(this.shakeT * 1.1) * a;
    this.shakeAmt *= Math.exp(-dt * 6);
  }

  release() {
    this.shotFrom = null;
  }

  update(dt: number, look: { yaw: number; pitch: number }, playerPos: THREE.Vector3, lockTarget: THREE.Vector3 | null) {
    if (this.frozen) return;
    const c = this.camera;
    if (this.shotFrom) {
      // Cutscene shot: glide toward the requested spot, but never end up inside a tree or wall.
      this.lookNow.lerp(this.shotLook, damp(3, dt));
      const want = this.shotFrom.clone().sub(this.lookNow);
      const len = want.length();
      const dir = want.normalize();
      const free = Math.max(0.8, this.physics.rayDistance(this.lookNow, dir, len, Layer.World | Layer.Prop) - 0.4);
      c.position.lerp(this.lookNow.clone().addScaledVector(dir, Math.min(len, free)), damp(3, dt));
      this.applyShake(dt);
      c.lookAt(this.lookNow);
      return;
    }

    this.yaw += look.yaw;
    this.pitch = clamp(this.pitch + look.pitch, MIN_PITCH, MAX_PITCH);
    if (look.yaw !== 0) this.recenterTo = null;

    const want = playerPos.clone().setY(playerPos.y + 1.6);
    if (lockTarget) {
      const desired = Math.atan2(playerPos.x - lockTarget.x, playerPos.z - lockTarget.z);
      this.yaw = lerpAngle(this.yaw, desired, damp(6, dt));
      this.pitch += (0.3 - this.pitch) * damp(4, dt);
      want.lerp(lockTarget, 0.3);
    } else if (this.recenterTo !== null) {
      this.yaw = lerpAngle(this.yaw, this.recenterTo, damp(10, dt));
      if (Math.abs(angleDiff(this.yaw, this.recenterTo)) < 0.01) this.recenterTo = null;
    }
    this.focus.lerp(want, damp(12, dt));

    // Pull in instantly when something blocks the view; ease back out when it clears.
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const free = Math.max(1.2, this.physics.rayDistance(this.focus, dir, this.dist, Layer.World) - 0.35);
    this.currentDist = free < this.currentDist ? free : this.currentDist + (free - this.currentDist) * damp(3, dt);

    c.position.copy(this.focus).addScaledVector(dir, this.currentDist);
    const floor = this.physics.groundY(c.position.x, c.position.z, this.focus.y + 2, Layer.World);
    if (floor !== null && c.position.y < floor + 0.6) c.position.y = floor + 0.6;
    this.applyShake(dt);
    c.lookAt(this.focus);
    this.lookNow.copy(this.focus);
  }
}
