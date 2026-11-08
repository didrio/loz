import { beforeAll, describe, expect, it } from 'vitest';
import { createArea } from '../content/areas';
import { initPhysics, Physics } from '../core/physics';
import { mergeAudit, type PlainStatic } from '../render/materials';
import type { Overworld } from './overworld';

beforeAll(async () => {
  await initPhysics();
});

/**
 * Owner's call (2026-11-07): everything wears a texture unless there is a real reason. The reasons: it glows (emissive: windows,
 * embers, light shafts, glyphs), it is a void (a black doorway, a well's dark bottom), or it is a tiny accent whose colour is
 * the point (flower petals). Water waits for its own ticket, and Sallowmere for the owner's redesign. A new plain static in
 * the valley, the Northpass or the shrine fails here: texture it (`surf(...)`), or justify it in `justified`.
 */
const VOID = 0x18151b;
const justified = (p: PlainStatic) => p.emissive !== 0 || p.color === VOID || Math.max(p.size.x, p.size.y, p.size.z) < 0.3;

const describePlain = (p: PlainStatic) =>
  `${p.geometry} #${p.color.toString(16).padStart(6, '0')} ${p.size.x.toFixed(1)}x${p.size.y.toFixed(1)}x${p.size.z.toFixed(1)} at ${p.at.x.toFixed(0)},${p.at.y.toFixed(0)},${p.at.z.toFixed(0)}`;

function plainStatics(build: () => void) {
  mergeAudit.on = true;
  mergeAudit.plain = [];
  try {
    build();
    return mergeAudit.plain.filter((p) => !justified(p)).map(describePlain);
  } finally {
    mergeAudit.on = false;
  }
}

describe('every static thing wears a texture', () => {
  it('the valley and the Northpass', () => {
    const plain = plainStatics(() => {
      const { area } = createArea('overworld', new Physics());
      // Everything south of the Sallowmere (z > -330): the village, the ruins, the hollow, the gorge, the camp, the pass.
      for (const [x, z] of [[0, -150], [0, 100], [-100, 0], [0, -250], [-10, -300], [100, 30], [-150, -40], [0, -60], [60, -90]]) (area as Overworld).streamAt(x, z);
    });
    expect(plain).toEqual([]);
  });

  it('the Waking Shrine', () => {
    expect(plainStatics(() => void createArea('shrine', new Physics()))).toEqual([]);
  });
});
