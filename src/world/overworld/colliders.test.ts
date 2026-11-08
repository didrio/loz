import { beforeAll, describe, expect, it } from 'vitest';
import { createArea } from '../../content/areas';
import { initPhysics, Physics } from '../../core/physics';
import { VILLAGE } from './layout';

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
 * The layout freeze for final passes on the overworld (docs/pipeline.md "Rooms and areas"; T51): a final pass changes how
 * things look, never where Wren can walk. Every collider the overworld builds (not the streamed regions) is described
 * to the millimetre; Thistledown's are listed one by one (so a failure says which), and all of them, the valley's trees
 * and rocks included, go into one digest. If one of these fails after a model change, the change moved a collider:
 * put it back (or ask the owner, and only then update the snapshot).
 */
function describeColliders() {
  const physics = new Physics();
  createArea('overworld', physics);
  const r3 = (n: number) => (Math.abs(n) < 5e-4 ? 0 : n).toFixed(3);
  const all: { line: string; x: number; z: number }[] = [];
  physics.world.forEachCollider((c) => {
    const s = c.shape as unknown as Record<string, unknown>;
    const dims: string[] = [];
    for (const k of ['halfExtents', 'radius', 'halfHeight', 'borderRadius']) {
      const v = s[k];
      if (typeof v === 'number') dims.push(`${k}=${r3(v)}`);
      else if (v && typeof v === 'object') dims.push(`${k}=${Object.values(v as Record<string, number>).map(r3).join(',')}`);
    }
    if (s.vertices instanceof Float32Array) dims.push(`verts=${s.vertices.length / 3}`);
    if (s.heights instanceof Float32Array) dims.push(`heights=${s.heights.length}`);
    const t = c.translation(), q = c.rotation();
    const line = `${c.shape.type} @${r3(t.x)},${r3(t.y)},${r3(t.z)} q${[q.x, q.y, q.z, q.w].map(r3).join(',')} ${dims.join(' ')} g${c.collisionGroups()} ${c.isSensor() ? 'sensor' : ''}`.trim();
    all.push({ line, x: t.x, z: t.z });
  });
  const lines = all.map((a) => a.line).sort();
  const village = all.filter((a) => Math.hypot(a.x - VILLAGE.x, a.z - VILLAGE.z) < VILLAGE.r + 10).map((a) => a.line).sort();
  return { count: lines.length, digest: hash(lines.join('\n')), village };
}

describe('the overworld layout is frozen', () => {
  const d = (() => {
    let cache: ReturnType<typeof describeColliders> | undefined;
    return () => (cache ??= describeColliders());
  })();

  it("Thistledown's colliders", () => {
    expect(d().village).toMatchSnapshot();
  });

  it('every collider of the overworld (the valley, its trees and rocks)', () => {
    expect({ count: d().count, digest: d().digest }).toMatchSnapshot();
  });
});
