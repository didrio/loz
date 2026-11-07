import * as THREE from 'three';
import { smoothstep } from '../core/math';

interface Key {
  h: number;
  top: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemiI: number;
}

// The day's palette, hour by hour. Interpolated in between.
const KEYS: Key[] = [
  { h: 0, top: 0x070b24, horizon: 0x1a2350, sun: 0x8fa3ff, sunI: 0.8, hemiI: 0.95 },
  { h: 4.8, top: 0x0b1030, horizon: 0x2a2f5c, sun: 0x8fa3ff, sunI: 0.75, hemiI: 0.95 },
  { h: 6, top: 0x45619e, horizon: 0xf3a66f, sun: 0xffb27a, sunI: 1.3, hemiI: 0.8 },
  { h: 8, top: 0x3f7fd2, horizon: 0xbfe0f2, sun: 0xfff0d8, sunI: 2.6, hemiI: 1.12 },
  { h: 16, top: 0x3a7acc, horizon: 0xc8e2f0, sun: 0xfff0d8, sunI: 2.6, hemiI: 1.12 },
  { h: 18, top: 0x3a4689, horizon: 0xf07c4e, sun: 0xff9a5c, sunI: 1.3, hemiI: 0.8 },
  { h: 19.3, top: 0x0f1538, horizon: 0x3b2c5e, sun: 0x8fa3ff, sunI: 0.8, hemiI: 0.95 },
  { h: 24, top: 0x070b24, horizon: 0x1a2350, sun: 0x8fa3ff, sunI: 0.8, hemiI: 0.95 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function sample(hours: number, field: 'top' | 'horizon' | 'sun', out: THREE.Color) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (hours >= a.h && hours <= b.h) {
      const t = (hours - a.h) / (b.h - a.h);
      return out.copy(tmpA.set(a[field])).lerp(tmpB.set(b[field]), t);
    }
  }
  return out.set(KEYS[0][field]);
}

function sampleNum(hours: number, field: 'sunI' | 'hemiI') {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (hours >= a.h && hours <= b.h) return a[field] + (b[field] - a[field]) * ((hours - a.h) / (b.h - a.h));
  }
  return KEYS[0][field];
}

/** Fog as data: a colour (hex) and where it starts and ends (meters). */
export interface FogLook {
  color: number;
  near: number;
  far: number;
}

export const DEFAULT_INDOOR_FOG: FogLook = { color: 0x0a0c10, near: 14, far: 60 };

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
  /** Indoors: no sky, no sun shadows, a dim warm fill and close dark fog (see `setIndoor`). */
  private indoor = false;
  /** The fog the area asks for indoors (a dungeon room's); the scene's fog eases toward it. */
  indoorFogTarget: FogLook = DEFAULT_INDOOR_FOG;
  /** Set by `setIndoor`: the next indoor update snaps to the target instead of easing from the outdoor fog. */
  private snapFog = false;
  private readonly gloomFog = new THREE.Color(0x120e1c);
  private readonly blightTop = new THREE.Color(0x2a1a3c);
  private readonly blightHorizon = new THREE.Color(0x56345f);
  private readonly blightSun = new THREE.Color(0x9a6aa8);
  private readonly blightGround = new THREE.Color(0x2e1c40);

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
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    scene.add(this.stars);

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 20), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 20), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
    scene.add(this.sunDisc, this.moonDisc);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a2a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -55;
    s.right = s.top = 55;
    s.near = 1;
    s.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
  }

  setIndoor(on: boolean) {
    this.indoor = on;
    this.snapFog = on;
    for (const o of [this.dome, this.stars, this.sunDisc, this.moonDisc]) o.visible = !on;
    this.sun.castShadow = !on;
    this.night = 0;
  }

  update(hours: number, focus: THREE.Vector3, camPos: THREE.Vector3, dt = 1 / 60) {
    if (this.indoor) {
      const fog = this.scene.fog as THREE.Fog;
      const g = this.gloom;
      const t = this.indoorFogTarget;
      // Boss gloom pulls the room's fog in, as it does outdoors.
      const want = { color: t.color, near: t.near - (t.near * 0.57) * g, far: t.far - (t.far * 0.5) * g };
      if (this.snapFog) {
        fog.color.setHex(want.color);
        fog.near = want.near;
        fog.far = want.far;
        this.snapFog = false;
      } else easeFog(fog, want, dt);
      // A soft overhead fill (no shadows: every ceiling would shade everything) plus a
      // warm/dark hemisphere; the rooms' own lights do the rest.
      this.sun.color.set(0xc8d4e0);
      this.sun.intensity = 0.45 * (1 - 0.6 * g);
      this.sun.position.copy(focus).add(new THREE.Vector3(10, 60, 20));
      this.sun.target.position.copy(focus);
      this.hemi.color.set(0x8e9cb0);
      this.hemi.groundColor.set(0x23262b);
      this.hemi.intensity = 0.9 * (1 - 0.5 * g);
      return;
    }
    this.hemi.groundColor.set(0x4a5a2a);
    sample(hours, 'top', this.uniforms.top.value);
    sample(hours, 'horizon', this.uniforms.horizon.value);
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
    // A close valley haze (owner's call, 2026-11-04); a boss fight and the blight pull it in further.
    fog.near = 50 - 35 * g - 32 * bl * (1 - g);
    fog.far = 215 - 145 * g - 105 * bl * (1 - g);

    this.sun.color.copy(sample(hours, 'sun', new THREE.Color())).lerp(this.blightSun, bl * 0.85);
    this.sun.intensity = sampleNum(hours, 'sunI') * (1 - 0.8 * g) * (1 - 0.5 * bl);
    this.hemi.intensity = sampleNum(hours, 'hemiI') * (1 - 0.6 * g) * (1 - 0.3 * bl);
    this.hemi.color.set(0xcfe6ff).lerp(tmpA.set(0x6a7ad0), this.night).lerp(tmpA.set(0x8a62b0), bl * 0.75);
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
