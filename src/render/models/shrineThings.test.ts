import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assetById } from './registry';
import { BELL_HOOK, buildBell, buildBellPost, buildDungeonTablet, buildKneelingKeeper, buildSleepingFace, buildWakestone, FACE, KEEPER, WAKESTONE_SIZE } from './shrineThings';

/** The Hall's things (T56b) keep the rough's frames: the colliders were measured from them. */
const bounds = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
};

describe('the wakestone keeps its cube', () => {
  for (const heavy of [false, true]) {
    it(`${heavy ? 'heavy' : 'light'}: the collider's size, standing on the floor, carvings a hand proud at most`, () => {
      const size = heavy ? WAKESTONE_SIZE.heavy : WAKESTONE_SIZE.light;
      const box = bounds(buildWakestone(heavy).root);
      expect(box.min.y).toBeGreaterThan(-0.02);
      expect(box.min.y).toBeLessThan(0.02);
      // Nothing rises above the top (a stone is stood on and slid under things) and nothing sticks out far.
      expect(box.max.y).toBeLessThan(size + 0.001);
      expect(box.max.x).toBeLessThan(size / 2 + 0.2);
      expect(box.min.x).toBeGreaterThan(-size / 2 - 0.2);
      expect(box.max.z).toBeLessThan(size / 2 + 0.2);
      expect(box.min.z).toBeGreaterThan(-size / 2 - 0.2);
      // The cube itself is there, to within a wobble.
      expect(box.max.x).toBeGreaterThan(size / 2 - 0.02);
    });
  }

  it('lets the area pulse a heavy stone: its spirals wear the shared material', () => {
    const glow = new THREE.MeshLambertMaterial({ color: 0x6ff6e6, emissive: 0x1fb8a8 });
    const m = buildWakestone(true, glow);
    const used: THREE.Material[] = [];
    m.root.traverse((o) => o instanceof THREE.Mesh && used.push(o.material as THREE.Material));
    expect(used).toContain(glow);
    expect(m.animated).toContain(glow);
    expect(m.joints.body).toBeInstanceOf(THREE.Group);
  });
});

describe('the tablet keeps its plinth and slab', () => {
  it("fits the rough's frame: a plinth 1.1 × 0.6, a slab to 1.5 m", () => {
    const box = bounds(buildDungeonTablet().root);
    expect(box.max.x).toBeLessThan(0.56);
    expect(box.min.x).toBeGreaterThan(-0.56);
    expect(box.max.z).toBeLessThan(0.31);
    expect(box.min.z).toBeGreaterThan(-0.31);
    expect(box.max.y).toBeGreaterThan(1.45);
    expect(box.max.y).toBeLessThan(1.55);
  });
});

describe('the bell and its post', () => {
  it('the pivot sits at the hook, where BellPost swings the bell', () => {
    const post = buildBellPost(null);
    expect(post.joints.pivot.position.toArray()).toEqual([BELL_HOOK.out, BELL_HOOK.y, 0]);
    expect(post.joints.pivot.children).toHaveLength(0);
    expect(buildBellPost().joints.pivot.children).toHaveLength(1);
  });

  it('stands on the floor inside the 0.5 m footing and 2.9 m of the rough', () => {
    const box = bounds(buildBellPost(null).root);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeLessThan(2.95);
    expect(box.min.x).toBeGreaterThan(-0.6);
    expect(box.max.x).toBeLessThan(1.5); // the arm reaches the hook, a bit past it
    expect(Math.abs(box.min.z)).toBeLessThan(0.6);
  });

  it('hangs from its loop (origin on top) and its bell can glow, rung or not', () => {
    const bell = buildBell();
    const box = bounds(bell.root);
    expect(box.max.y).toBeGreaterThan(0.01);
    expect(box.max.y).toBeLessThan(0.1);
    expect(box.min.y).toBeLessThan(-0.55);
    expect(bell.animated).toContain(bell.bellMat);
    expect(bell.bellMat.emissive.getHex()).toBe(0);
    expect(buildBell(0xc9a24a, 0x301818).bellMat.emissive.r).toBeGreaterThan(0);
  });
});

describe("the sandstone wing's carvings", () => {
  it('a sleeping face begins above the tallest wakestone and stands a hand off the wall', () => {
    const box = bounds(buildSleepingFace().root);
    expect(box.min.y).toBeGreaterThanOrEqual(WAKESTONE_SIZE.heavy + 0.1);
    expect(box.min.y).toBeCloseTo(FACE.bottom, 1);
    expect(box.max.y).toBeLessThan(FACE.top + 0.01);
    expect(box.min.z).toBeGreaterThan(-0.02); // none of it behind the wall's face
    expect(box.max.z).toBeLessThan(0.35);
    expect(box.max.x - box.min.x).toBeLessThan(FACE.width + 0.05);
  });

  it("a keeper kneels inside its collider's footprint, the head the only part past its top", () => {
    const box = bounds(buildKneelingKeeper().root);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.x).toBeLessThan(KEEPER.alongHalf + 0.05);
    expect(box.min.x).toBeGreaterThan(-KEEPER.alongHalf - 0.05);
    expect(box.min.z).toBeGreaterThan(KEEPER.out - KEEPER.depthHalf - 0.05);
    expect(box.max.z).toBeLessThan(KEEPER.out + KEEPER.depthHalf + 0.05);
    expect(box.max.y).toBeLessThan(KEEPER.height + 0.3);
    expect(box.max.y).toBeGreaterThan(KEEPER.height - 0.2);
  });
});

describe('registered final, in budget', () => {
  for (const id of ['wakestone', 'wakestone-heavy', 'dungeon-tablet', 'bell', 'bell-post', 'shrine-face', 'shrine-keeper']) {
    it(id, () => {
      expect(assetById(id)?.tier).toBe('final');
    });
  }
});
