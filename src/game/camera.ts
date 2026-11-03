import * as THREE from 'three';
import { angleDiff, clamp, damp, lerpAngle } from '../core/math';
import { Layer, type Physics } from '../core/physics';

const MIN_PITCH = -0.15;
const MAX_PITCH = 1.1;
/** The camera is a ball this big: it stops this far short of walls, ceilings and floors. */
const CAM_RADIUS = 0.35;
/** Closest the camera comes to Wren's chest. */
const MIN_DIST = 0.7;
/** Wren starts fading out when the camera is closer than this... */
const FADE_START = 1.7;
/** ...and is hidden entirely closer than this (a sheet of dither noise would be worse than nothing). */
const FADE_END = 1.1;

/**
 * Third-person orbit camera. Turned by the player (mouse, right stick, arrows); when locked
 * on it swings behind the player and frames the target.
 *
 * Collision is one rule, indoors and out (the usual third-person approach): a small ball is
 * swept from Wren's chest back toward where the camera wants to be; if it hits a wall,
 * ceiling or the ground, the camera comes in to that point at once (it must never show the
 * inside of a wall), then drifts back out slowly when the way clears, so walking along a wall
 * doesn't make it pump in and out. When it ends up very close, Wren fades out
 * (`playerOpacity`) so she never blocks the view. Trees and fences (Prop) don't count.
 * Scripts can take it over with `shot()`.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  dist = 9;
  /** How visible Wren should be (1 = fully); she fades when the camera is pressed close. */
  playerOpacity = 1;
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
      this.playerOpacity = 1;
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

    // Pull in at once when something blocks the view; ease back out when it clears.
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const free = Math.max(MIN_DIST, this.physics.sphereDistance(this.focus, dir, this.dist, CAM_RADIUS, Layer.World));
    this.currentDist = free < this.currentDist ? free : this.currentDist + (free - this.currentDist) * damp(2, dt);

    c.position.copy(this.focus).addScaledVector(dir, this.currentDist);
    this.playerOpacity = clamp((this.currentDist - FADE_END) / (FADE_START - FADE_END), 0, 1);
    this.applyShake(dt);
    c.lookAt(this.focus);
    this.lookNow.copy(this.focus);
  }
}
