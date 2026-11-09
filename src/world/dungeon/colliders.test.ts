import { beforeAll, describe, expect, it } from 'vitest';
import { createArea } from '../../content/areas';
import { initPhysics, Physics } from '../../core/physics';
import { SHRINE } from './defs/shrine';

beforeAll(async () => {
  await initPhysics();
});

/** FNV-1a over the text, as 8 hex digits: enough to notice any change. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * The layout freeze for final passes on the shrine (docs/pipeline.md "Rooms and areas"; T56): a final pass changes how
 * rooms look, never where Wren can walk or where a stone can slide. Every collider the shrine builds is described to the
 * millimetre; the Hall of Sleepers' are listed one by one (so a failure says which), and all of them go into one digest.
 * If one of these fails after a model change, the change moved a collider: put it back (or ask the owner, and only then
 * update the snapshot).
 */
function describeColliders() {
  const physics = new Physics();
  createArea('shrine', physics);
  const hall = SHRINE.rooms.find((r) => r.id === 'entry')!;
  const r3 = (n: number) => (Math.abs(n) < 5e-4 ? 0 : n).toFixed(3);
  const all: { line: string; x: number; y: number; z: number }[] = [];
  physics.world.forEachCollider((c) => {
    const s = c.shape as unknown as Record<string, unknown>;
    const dims: string[] = [];
    for (const k of ['halfExtents', 'radius', 'halfHeight', 'borderRadius']) {
      const v = s[k];
      if (typeof v === 'number') dims.push(`${k}=${r3(v)}`);
      else if (v && typeof v === 'object') dims.push(`${k}=${Object.values(v as Record<string, number>).map(r3).join(',')}`);
    }
    if (s.vertices instanceof Float32Array) dims.push(`verts=${s.vertices.length / 3}`);
    const t = c.translation(), q = c.rotation();
    const line = `${c.shape.type} @${r3(t.x)},${r3(t.y)},${r3(t.z)} q${[q.x, q.y, q.z, q.w].map(r3).join(',')} ${dims.join(' ')} g${c.collisionGroups()} ${c.isSensor() ? 'sensor' : ''} ${c.isEnabled() ? '' : 'off'}`.trim();
    all.push({ line, x: t.x, y: t.y, z: t.z });
  });
  const lines = all.map((a) => a.line).sort();
  // The Hall's floor (floor 0 lies at y = 0) and a metre round it, so its walls and doorways count.
  const inHall = (a: { x: number; y: number; z: number }) =>
    a.x > hall.x - 1 && a.x < hall.x + hall.w + 1 && a.z > hall.z - 1 && a.z < hall.z + hall.d + 1 && a.y > -2 && a.y < 8;
  return { count: lines.length, digest: hash(lines.join('\n')), hall: all.filter(inHall).map((a) => a.line).sort() };
}

describe('the shrine layout is frozen', () => {
  const d = (() => {
    let cache: ReturnType<typeof describeColliders> | undefined;
    return () => (cache ??= describeColliders());
  })();

  it("the Hall of Sleepers' colliders", () => {
    expect(d().hall).toMatchSnapshot();
  });

  it('every collider of the shrine', () => {
    expect({ count: d().count, digest: d().digest }).toMatchSnapshot();
  });
});
