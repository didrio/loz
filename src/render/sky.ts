import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { ATMOSPHERES, blendLight, easeWeights, isIndoor, moteLook, newSampled, type AtmosphereId, type FogLook, type IndoorAtmosphere, type MoteLook, type OutdoorId, type Weights } from './atmosphere';
import { pal } from './palette';

export type { FogLook };

const tmpA = new THREE.Color();

export const DEFAULT_INDOOR_FOG: FogLook = { color: pal('ink', 1), near: 14, far: 60 };

/** How fast indoor fog eases toward a new room's look (1/s): a crossing takes about a second and a half. */
export const FOG_EASE = 2.5;

const tmpFog = new THREE.Color();

/** Eases `fog` toward `target` over `dt` seconds; returns nothing, changes `fog`. */
export function easeFog(fog: THREE.Fog, target: FogLook, dt: number) {
  const k = 1 - Math.exp(-FOG_EASE * dt);
  fog.color.lerp(tmpFog.setHex(target.color), k);
  fog.near += (target.near - fog.near) * k;
  fog.far += (target.far - fog.far) * k;
}

/** Sky dome, sun, moon, stars and the lights that follow the time of day. */
export class Sky {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private dome: THREE.Mesh;
  private uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  private stars: THREE.Points;
  private sunDisc: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  /** 0 by day, 1 at full night. */
  night = 0;
  /** Boss-fight darkness, 0–1: dims the lights, pulls the fog in and tints it violet. */
  gloom = 0;
  /**
   * The valley's sickness, 0–1 (game/blight.ts): a violet-black sky and fog, weaker light, dim stars,
   * the same by day and by night. Outdoors only; boss gloom stacks on top of it.
   */
  blight = 0;
  /** Indoors: no sky, no sun, a dim fill and close dark fog (see `setIndoor`). */
  private indoor = false;
  /** Which place's look the light follows, and how much of each while one gives way to the next (render/atmosphere.ts). */
  private weights: Weights = { valley: 1 };
  private indoorLook: IndoorAtmosphere = ATMOSPHERES.shrine as IndoorAtmosphere;
  private target: OutdoorId = 'valley';
  private readonly light = newSampled();
  /** The fog the area asks for indoors (a dungeon room's); the scene's fog eases toward it. */
  indoorFogTarget: FogLook = DEFAULT_INDOOR_FOG;
  /** Set by `setIndoor`: the next indoor update snaps to the target instead of easing from the outdoor fog. */
  private snapFog = false;
  private readonly gloomFog = new THREE.Color(pal('night', 0));
  private readonly blightTop = new THREE.Color(pal('blight', 0));
  private readonly blightHorizon = new THREE.Color(pal('blight'));
  private readonly blightSun = new THREE.Color(pal('blight', 3));
  private readonly blightGround = new THREE.Color(pal('blight', 0));

  constructor(private scene: THREE.Scene) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 c = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, y), 0.55)) : horizon * 0.85;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.05;
      const r = 560;
      starPos.push(Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: pal('chalk', 3), size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    scene.add(this.stars);

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 20), new THREE.MeshBasicMaterial({ color: pal('flame', 3), fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 20), new THREE.MeshBasicMaterial({ color: pal('moon', 3), fog: false }));
    scene.add(this.sunDisc, this.moonDisc);

    this.hemi = new THREE.HemisphereLight(pal('moon', 3), pal('olive', 1), 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(pal('chalk', 3), 2);
    scene.add(this.sun, this.sun.target);
  }

  setIndoor(on: boolean) {
    this.indoor = on;
    this.snapFog = on;
    for (const o of [this.dome, this.stars, this.sunDisc, this.moonDisc]) o.visible = !on;
    this.night = 0;
  }

  /**
   * Which place's atmosphere the light follows (render/atmosphere.ts). Outdoors, the look eases across to it
   * over about two seconds; `snap` (a new area, a teleport) jumps. An indoor id turns the indoor look on.
   */
  setAtmosphere(id: AtmosphereId, snap = false) {
    if (isIndoor(id)) {
      this.indoorLook = ATMOSPHERES[id] as IndoorAtmosphere;
      return;
    }
    this.target = id;
    if (snap) this.weights = { [id]: 1 };
  }

  /** What drifts through the air now (the place's motes, or the blight's ash), for `Motes`. */
  moteLook(): MoteLook | null {
    return moteLook(this.weights, this.blight, this.indoor ? this.indoorLook : null);
  }

  update(hours: number, focus: THREE.Vector3, camPos: THREE.Vector3, dt = 1 / 60) {
    if (this.indoor) {
      const fog = this.scene.fog as THREE.Fog;
      const g = this.gloom;
      const t = this.indoorFogTarget;
      const fill = this.indoorLook.fill;
      // Boss gloom pulls the room's fog in, as it does outdoors.
      const want = { color: t.color, near: t.near - (t.near * 0.57) * g, far: t.far - (t.far * 0.5) * g };
      if (this.snapFog) {
        fog.color.setHex(want.color);
        fog.near = want.near;
        fog.far = want.far;
        this.snapFog = false;
      } else easeFog(fog, want, dt);
      // A soft overhead fill (the sun's light would be wrong under every ceiling) plus a
      // warm/dark hemisphere; the rooms' own lights do the rest.
      this.sun.color.set(fill.sun);
      this.sun.intensity = fill.sunI * (1 - 0.6 * g);
      this.sun.position.copy(focus).add(new THREE.Vector3(10, 60, 20));
      this.sun.target.position.copy(focus);
      this.hemi.color.set(fill.hemi);
      this.hemi.groundColor.set(fill.ground);
      this.hemi.intensity = fill.hemiI * (1 - 0.5 * g);
      return;
    }
    this.hemi.groundColor.set(pal('olive', 1));
    this.weights = easeWeights(this.weights, this.target, dt);
    const light = blendLight(this.weights, hours, this.light);
    this.uniforms.top.value.copy(light.top);
    this.uniforms.horizon.value.copy(light.horizon);
    const fog = this.scene.fog as THREE.Fog;
    const g = this.gloom;
    const bl = this.blight;
    const a = ((hours - 6) / 24) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
    const moonDir = sunDir.clone().negate();
    const lightDir = sunDir.y > -0.04 ? sunDir : moonDir;
    this.night = smoothstep(0.15, -0.12, sunDir.y);
    // The blight's sky is the same colour all day; at night it sinks as far as the night sky does.
    const dim = 1 - 0.55 * this.night;
    this.uniforms.top.value.lerp(tmpA.copy(this.blightTop).multiplyScalar(dim), bl * 0.85);
    this.uniforms.horizon.value.lerp(tmpA.copy(this.blightHorizon).multiplyScalar(dim), bl * 0.85);
    this.uniforms.top.value.lerp(this.gloomFog, g * 0.8);
    this.uniforms.horizon.value.lerp(this.gloomFog, g * 0.85);
    fog.color.copy(this.uniforms.horizon.value);
    // The place's fog reach (a close valley haze, owner's call 2026-11-04); a boss fight and the blight pull it in further.
    fog.near = light.near * (1 - 0.7 * g - 0.64 * bl * (1 - g));
    fog.far = light.far * (1 - 0.6744 * g - 0.4884 * bl * (1 - g));

    this.sun.color.copy(light.sun).lerp(this.blightSun, bl * 0.85);
    this.sun.intensity = light.sunI * (1 - 0.8 * g) * (1 - 0.5 * bl);
    this.hemi.intensity = light.hemiI * (1 - 0.6 * g) * (1 - 0.3 * bl);
    this.hemi.color.set(pal('moon', 3)).lerp(tmpA.set(pal('moon', 1)), this.night).lerp(tmpA.set(pal('blight', 3)), bl * 0.75);
    this.hemi.groundColor.lerp(this.blightGround, bl * 0.7);
    this.sun.position.copy(focus).addScaledVector(lightDir, 120);
    this.sun.target.position.copy(focus);

    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.rotation.y = hours * 0.05;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(this.night, g * 0.6) * (1 - 0.6 * bl);
    this.sunDisc.position.copy(camPos).addScaledVector(sunDir, 500);
    this.sunDisc.lookAt(camPos);
    this.moonDisc.position.copy(camPos).addScaledVector(moonDir, 500);
    this.moonDisc.lookAt(camPos);
  }
}
