import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * EXPERIMENT (branch experiment/tripo): rigged, imported humanoids (a GLB with a Mixamo-named skeleton) and their
 * animation clips, from the GLB itself or from Mixamo FBX downloads. AGENTS.md forbids imported art on main; this
 * is here to test whether it's worth changing that rule.
 *
 * Mixamo's skeleton and an auto-rigger's skeleton share bone *names* but not each bone's rest orientation, so FBX
 * clips are retargeted (`retargetClip`): each bone keeps the clip's world-space rotation *relative to the T-pose*.
 * Root motion is stripped (`inPlace`): the game's physics moves the character, the clip only moves the limbs.
 */

const HIPS = 'mixamorigHips';

/** The rotation of `bone` in `root`'s frame (the product of the local rotations between them). */
function relQuat(bone: THREE.Object3D, root: THREE.Object3D, out = new THREE.Quaternion()) {
  out.identity();
  for (let o: THREE.Object3D | null = bone; o && o !== root; o = o.parent) out.premultiply(o.quaternion);
  return out;
}

function bonesOf(root: THREE.Object3D) {
  const map = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) map.set(o.name, o as THREE.Bone);
  });
  return map;
}

/** The position of `bone` in `root`'s local frame. */
function relPos(bone: THREE.Object3D, root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

/**
 * Re-expresses `clip` (made for the skeleton under `src`, in its rest pose) for the skeleton under `dst` (in its
 * rest pose). Both must stand in the same rest pose (both T-pose) and face the same way. Bones are matched by name;
 * `dst` bones the clip doesn't move get no track. The hips' height change is scaled to `dst`'s size; with
 * `inPlace`, their horizontal travel is dropped.
 */
export function retargetClip(src: THREE.Object3D, clip: THREE.AnimationClip, dst: THREE.Object3D, inPlace = true): THREE.AnimationClip {
  const sb = bonesOf(src), db = bonesOf(dst);
  const srcRest = new Map<string, THREE.Quaternion>(), dstRest = new Map<string, THREE.Quaternion>();
  for (const [n, b] of sb) srcRest.set(n, relQuat(b, src));
  for (const [n, b] of db) dstRest.set(n, relQuat(b, dst));
  const srcLocalRest = new Map([...sb].map(([n, b]) => [n, b.quaternion.clone()] as const));
  const srcHips = sb.get(HIPS), dstHips = db.get(HIPS);
  const srcHipsPos0 = srcHips ? relPos(srcHips, src) : null;
  const srcHipsLocal0 = srcHips?.position.clone();
  const dstHipsPos0 = dstHips ? relPos(dstHips, dst) : null;
  const scale = srcHipsPos0 && dstHipsPos0 && srcHipsPos0.y ? dstHipsPos0.y / srcHipsPos0.y : 1;
  const dstHipsParentRest = dstHips?.parent ? relQuat(dstHips.parent, dst).invert() : new THREE.Quaternion();

  // The target's bones the clip can drive, parents before children (traverse order).
  const order: THREE.Bone[] = [];
  dst.traverse((o) => {
    if ((o as THREE.Bone).isBone && sb.has(o.name)) order.push(o as THREE.Bone);
  });
  const times = clip.tracks.find((t) => t.name.endsWith('.quaternion'))?.times ?? new Float32Array([0]);
  const quats = new Map(order.map((b) => [b.name, new Float32Array(times.length * 4)] as const));
  const hipsPos = new Float32Array(times.length * 3);

  const mixer = new THREE.AnimationMixer(src);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); // a looping action wraps at the last key back to the first
  action.clampWhenFinished = true;
  action.play();
  const srcNow = new Map<string, THREE.Quaternion>();
  const dstNow = new Map<string, THREE.Quaternion>();
  const tmp = new THREE.Quaternion(), local = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
  for (let i = 0; i < times.length; i++) {
    mixer.setTime(times[i]);
    for (const [n, b] of sb) srcNow.set(n, relQuat(b, src, srcNow.get(n) ?? new THREE.Quaternion()));
    for (const b of order) {
      // World now = source world now · source rest⁻¹ · target rest (the same turn away from the T-pose).
      const w = (dstNow.get(b.name) ?? new THREE.Quaternion()).copy(srcNow.get(b.name)!).multiply(tmp.copy(srcRest.get(b.name)!).invert()).multiply(dstRest.get(b.name)!);
      dstNow.set(b.name, w);
      const p = b.parent;
      if (p && dstNow.has(p.name) && (p as THREE.Bone).isBone) parentQ.copy(dstNow.get(p.name)!);
      else if (p) relQuat(p, dst, parentQ);
      else parentQ.identity();
      local.copy(parentQ).invert().multiply(w);
      local.toArray(quats.get(b.name)!, i * 4);
    }
    if (srcHips && dstHips && srcHipsPos0) {
      const d = relPos(srcHips, src).sub(srcHipsPos0).multiplyScalar(scale);
      if (inPlace) d.x = d.z = 0;
      d.applyQuaternion(dstHipsParentRest).add(dstHips.position);
      d.toArray(hipsPos, i * 3);
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(src);
  // Put the source back in its rest pose (setTime moved it).
  for (const [n, b] of sb) b.quaternion.copy(srcLocalRest.get(n)!);
  if (srcHips && srcHipsLocal0) srcHips.position.copy(srcHipsLocal0);

  const tracks: THREE.KeyframeTrack[] = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, Array.from(times), Array.from(quats.get(b.name)!)));
  if (srcHips && dstHips) tracks.push(new THREE.VectorKeyframeTrack(`${dstHips.name}.position`, Array.from(times), Array.from(hipsPos)));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Pins the hips' horizontal position to `rest` in every key (a clip made for the target, with root motion). */
export function stripRootMotion(clip: THREE.AnimationClip, rest: THREE.Vector3) {
  const t = clip.tracks.find((k) => k.name === `${HIPS}.position`);
  if (!t) return clip;
  for (let i = 0; i < t.values.length; i += 3) {
    t.values[i] = rest.x;
    t.values[i + 2] = rest.z;
  }
  return clip;
}

/** A loaded model and its clips (by name), shared by every instance. */
export interface RigSource {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

const cache = new Map<string, Promise<RigSource>>();

/**
 * Loads the GLB at `url` and the FBX clips (`name` → url), once per url set; later calls share it.
 * GLB clips keep their own names; FBX clips take the given ones.
 */
export function loadRig(url: string, fbxClips: Record<string, string> = {}): Promise<RigSource> {
  const key = url + JSON.stringify(fbxClips);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const gltf = await new GLTFLoader().loadAsync(url);
      const scene = gltf.scene;
      const hips = bonesOf(scene).get(HIPS);
      const clips = new Map<string, THREE.AnimationClip>();
      for (const c of gltf.animations) clips.set(c.name, hips ? stripRootMotion(c, hips.position) : c);
      const fbx = new FBXLoader();
      await Promise.all(Object.entries(fbxClips).map(async ([name, u]) => {
        const g = await fbx.loadAsync(u);
        const c = g.animations[0];
        if (c) clips.set(name, retargetClip(g, c, scene));
      }));
      return { scene, clips };
    })();
    cache.set(key, p);
  }
  return p;
}

export interface PlayOptions {
  /** Default true. A one-shot clip holds its last frame. */
  loop?: boolean;
  /** Crossfade seconds (default 0.2). */
  fade?: number;
  /** Playback speed (default 1). */
  speed?: number;
}

/**
 * One character built from a `RigSource`: its own skeleton (a clone), a mixer, Lambert materials (lit like the rest
 * of the game, and flashable), and a head that can turn toward a point.
 */
export class RiggedModel {
  readonly object: THREE.Object3D;
  /** One per mesh; the owner may tint `emissive` (hit flash, a glow). */
  readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  currentName = '';
  private readonly neck?: THREE.Object3D;
  private readonly head?: THREE.Object3D;
  private lookYaw = 0;
  private lookPitch = 0;
  private readonly onDone: (e: { action: THREE.AnimationAction }) => void;
  /** Called when a one-shot clip ends (its name). */
  onFinished: ((name: string) => void) | null = null;

  constructor(src: RigSource, scale: number) {
    this.object = SkeletonUtils.clone(src.scene);
    this.object.scale.setScalar(scale);
    this.object.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.frustumCulled = false; // skinned bounds are the bind pose, not the animated one
      m.castShadow = true;
      const old = m.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshLambertMaterial({ map: old.map ?? null, color: old.map ? 0xffffff : old.color });
      this.materials.push(mat);
      m.material = mat;
    });
    this.mixer = new THREE.AnimationMixer(this.object);
    for (const [name, clip] of src.clips) this.actions.set(name, this.mixer.clipAction(clip));
    const bones = bonesOf(this.object);
    this.neck = bones.get('mixamorigNeck');
    this.head = bones.get('mixamorigHead');
    this.onDone = (e) => {
      const name = [...this.actions].find(([, a]) => a === e.action)?.[0];
      if (name) this.onFinished?.(name);
    };
    this.mixer.addEventListener('finished', this.onDone as never);
  }

  has(name: string) {
    return this.actions.has(name);
  }

  /** Plays `name` (crossfading from the current clip). Replaying the current looped clip does nothing. */
  play(name: string, o: PlayOptions = {}) {
    const next = this.actions.get(name);
    if (!next) return;
    const loop = o.loop ?? true;
    if (next === this.current && loop) {
      next.setEffectiveTimeScale(o.speed ?? 1);
      return;
    }
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.setEffectiveTimeScale(o.speed ?? 1);
    next.setEffectiveWeight(1);
    const fade = o.fade ?? 0.2;
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    else next.fadeIn(fade);
    next.play();
    this.current = next;
    this.currentName = name;
  }

  /**
   * Advances the clips, then turns the neck and head toward `target` (world space), or back to straight ahead
   * when null. The turn is clamped (about 70° aside, 30° up or down) and eases in.
   */
  update(dt: number, target: THREE.Vector3 | null = null) {
    this.mixer.update(dt);
    if (!this.head || !this.neck) return;
    let yaw = 0, pitch = 0;
    if (target) {
      this.object.updateMatrixWorld(true);
      const local = this.object.worldToLocal(target.clone());
      const headAt = this.object.worldToLocal(this.head.getWorldPosition(new THREE.Vector3()));
      const d = local.sub(headAt);
      yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.2, 1.2);
      pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.5);
      if (Math.abs(Math.atan2(d.x, d.z)) > 2.2) yaw = 0; // behind it: don't wrench round
    }
    const k = 1 - Math.exp(-6 * dt);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 1e-3 && Math.abs(this.lookPitch) < 1e-3) return;
    this.object.updateMatrixWorld(true);
    const rootQ = this.object.getWorldQuaternion(new THREE.Quaternion());
    for (const [bone, w] of [[this.neck, 0.4], [this.head, 0.6]] as const) {
      // The turn in the model's frame (yaw about up, pitch about the left-right axis; +Z is forward), made a world turn.
      const d = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.lookPitch * w, this.lookYaw * w, 0, 'YXZ'));
      const dw = rootQ.clone().multiply(d).multiply(rootQ.clone().invert());
      const pw = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.premultiply(pw.clone().invert().multiply(dw).multiply(pw));
      bone.updateMatrixWorld(true);
    }
  }

  dispose() {
    this.mixer.removeEventListener('finished', this.onDone as never);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
    for (const m of this.materials) m.dispose();
    this.object.removeFromParent();
  }
}
