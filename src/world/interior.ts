import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { Layer, type Physics } from '../core/physics';
import { mat } from '../render/materials';
import { AreaBuilder, type Area, type Interactable, type Trigger } from './area';

const W = 8, D = 7, H = 3.2, T = 0.3, LOW = 1.0;
const DOOR_X = W / 2, DOOR_W = 1.8;

/**
 * The inside of Tobin's mill: one warm room with a bed, a table, shelves and flour sacks.
 * Open to the sky above (no ceiling mesh) so the camera never sits inside a roof; the walls
 * stop it. Walking out through the doorway on the south side is the `exit` trigger.
 */
export class MillInterior implements Area {
  readonly id = 'mill';
  readonly root: THREE.Group;
  readonly spawn = { x: DOOR_X, z: D - 1.8, facing: Math.PI };
  readonly waterLevel = null;
  readonly enemyCount = 0;
  readonly indoor = true;
  readonly music = 'village' as const;
  readonly interactables: Interactable[];
  readonly triggers: Trigger[];
  /** Where the bed is (for the content's camera and particles). */
  readonly bed = { x: 1.5, z: 1.1 };
  private readonly light = new THREE.PointLight(0xffc27a, 0, 14, 1.2);
  private readonly disposer: () => void;
  private t = 0;

  constructor(physics: Physics) {
    const b = new AreaBuilder(physics, mulberry32(11));
    const wall = mat(0xcdb894), trim = mat(0x6d5236), wood = mat(0x8a5a2b);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, collide = false) => {
      const me = b.mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
      if (collide) b.box(x, y + h / 2, z, w / 2, h / 2, d / 2, 0, Layer.Prop);
      return me;
    };

    // Floor, rug and the four walls (the south one has the doorway).
    box(W + 2 * T, 0.3, D + 2 * T, mat(0x6d5236), W / 2, -0.3, D / 2);
    b.box(W / 2, -0.5, D / 2, W / 2 + 2, 0.5, D / 2 + 2);
    box(3.6, 0.03, 2.6, mat(0x8a3b28), W / 2, 0, 3.2);
    // The door wall is drawn low (a cutaway), since the camera always sits on that side.
    const wallBox = (w: number, d: number, x: number, z: number, shown = H) => {
      box(w, shown, d, wall, x, 0, z);
      b.box(x, H / 2, z, w / 2, H / 2, d / 2);
    };
    wallBox(W + 2 * T, T, W / 2, -T / 2);
    wallBox(T, D, -T / 2, D / 2);
    wallBox(T, D, W + T / 2, D / 2);
    const side = DOOR_X - DOOR_W / 2;
    wallBox(side, T, side / 2, D + T / 2, LOW);
    wallBox(side, T, W - side / 2, D + T / 2, LOW);
    box(0.2, LOW + 0.1, 0.4, trim, DOOR_X - DOOR_W / 2, 0, D + T / 2);
    box(0.2, LOW + 0.1, 0.4, trim, DOOR_X + DOOR_W / 2, 0, D + T / 2);
    // Nothing past the doorway to walk into: the exit trigger fires first, this just backstops it.
    b.box(DOOR_X, 1.5, D + 1.4, DOOR_W, 1.5, 0.3);

    // Bed against the north-west corner: frame, mattress, blanket, pillow.
    const { x: bx, z: bz } = this.bed;
    box(2.4, 0.45, 1.3, wood, bx, 0, bz, true);
    box(2.2, 0.2, 1.1, mat(0xf0e8d8), bx, 0.45, bz);
    box(1.4, 0.24, 1.14, mat(0xa5452f), bx + 0.4, 0.45, bz);
    box(0.5, 0.16, 0.8, mat(0xfff8ec), bx - 0.8, 0.65, bz);
    box(0.12, 1.0, 1.3, wood, bx - 1.26, 0, bz);

    // Table with two stools, a shelf of jars, the hearth and flour sacks (it is a mill).
    box(1.7, 0.1, 1.0, wood, 5.6, 0.85, 3.6);
    for (const [dx, dz] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]]) box(0.1, 0.85, 0.1, trim, 5.6 + dx, 0, 3.6 + dz);
    b.box(5.6, 0.45, 3.6, 0.9, 0.45, 0.55, 0, Layer.Prop);
    for (const dx of [-1.3, 1.3]) {
      const s = b.mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.45, 8), wood, 5.6 + dx, 0.23, 3.6);
      s.castShadow = true;
    }
    box(2.8, 2.2, 0.5, wood, 5.6, 0, 0.35, true);
    [0xb4532a, 0x4f7d4a, 0xd9a531, 0x5b6f9a].forEach((c, i) => {
      b.mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.4, 7), mat(c), 4.5 + i * 0.75, 1.5, 0.6);
      b.mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.4, 7), mat(c), 4.7 + i * 0.7, 0.55, 0.6);
    });
    box(1.0, 1.5, 1.4, mat(0x7d7468), W - 0.8, 0, 3.0, true);
    box(0.7, 0.1, 1.0, mat(0xe8a24a), W - 0.8, 1.5, 3.0);
    for (const [x, z] of [[W - 0.9, D - 1.0], [W - 1.9, D - 0.8], [W - 1.3, D - 1.9]]) {
      const sack = b.mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8), mat(0xe2d6bf), x, 0.4, z);
      sack.castShadow = true;
      b.cylinder(x, 0.4, z, 0.4, 0.5, Layer.Prop);
    }

    const light = this.light;
    light.position.set(W / 2, 2.6, D / 2 - 0.5);
    b.dynamic(light);

    this.interactables = [
      { id: 'bed', x: bx + 0.2, z: bz + 1.2, r: 1.9, label: 'Sleep', promptY: 1.4, enabled: () => true },
    ];
    this.triggers = [{ id: 'exit', x: DOOR_X, z: D + 0.2, r: 0.9, enabled: () => true }];

    const done = b.finish();
    this.root = done.root;
    this.disposer = done.dispose;
  }

  nameAt() {
    return "Tobin's Mill";
  }

  enemySpot() {
    return null;
  }

  cut() {
    return [];
  }

  update(dt: number) {
    this.t += dt;
    this.light.intensity = 17 * (0.94 + Math.sin(this.t * 7) * 0.035 + Math.sin(this.t * 13.3) * 0.025);
  }

  dispose() {
    this.disposer();
  }
}
