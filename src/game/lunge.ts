import type { Area } from '../world/area';
import { sameLevel } from '../world/area';

/** The step a swing takes forward: speed (m/s) for the first `LUNGE_TIME` seconds, so about 0.36 m. */
export const LUNGE_SPEED = 3;
export const LUNGE_TIME = 0.12;
const LUNGE_DIST = LUNGE_SPEED * LUNGE_TIME;
/** Past the step's end, how near a hazard or a plant still cancels it (Wren's body is wider than her feet). */
const MARGIN = 0.6;
/** The most the ground may fall away at the step's end before it's cancelled (a ledge). */
const MAX_DROP = 0.4;

/**
 * Whether a swing from `pos` facing (fx, fz) (unit) may step forward. It may not when the step could
 * carry Wren somewhere she didn't choose: onto the blight's thorns or scars, off a ledge, or out of reach
 * of what she's standing at (a sign, a person, a Murmurbud). Walls and enemies need no check: her body
 * stops against them. She then swings on the spot.
 */
export function lungeClear(
  area: Pick<Area, 'interactables' | 'buds' | 'thornAt'>,
  groundY: (x: number, z: number) => number | null,
  pos: { x: number; y: number; z: number },
  fx: number,
  fz: number,
): boolean {
  for (const d of [LUNGE_DIST, LUNGE_DIST + MARGIN]) {
    if (area.thornAt?.(pos.x + fx * d, pos.y, pos.z + fz * d)) return false;
  }
  const g = groundY(pos.x + fx * (LUNGE_DIST + 0.3), pos.z + fz * (LUNGE_DIST + 0.3));
  if (g === null || g < pos.y - MAX_DROP) return false;
  for (const it of area.interactables) {
    if (it.enabled() && sameLevel(it.y, pos.y) && Math.hypot(pos.x - it.x, pos.z - it.z) < it.r + LUNGE_DIST) return false;
  }
  if (area.buds) {
    for (const b of area.buds.values()) {
      if (!b.taken && Math.hypot(pos.x - b.x, pos.z - b.z) < 1.5 + LUNGE_DIST) return false;
    }
  }
  return true;
}
