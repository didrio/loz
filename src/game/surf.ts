/**
 * Shield surfing: Wren rides her shield along the ground, a travel move (the player's sprint).
 * Once the Thistledown kid has given her the idea (`village.surfIdea`), landing from a jump with
 * the shield held puts her on it; she rides for as long as the shield is held. It's outdoors
 * only, and it isn't a guard: the shield is under her feet, so hits land and knock her off.
 *
 * Ends at once on: letting go of the shield, lock-on, a swing (which then starts as normal),
 * wading-depth water, a hit (she's no longer free to move), the glove throw or a guard break.
 * A jump while surfing is a hop: the ride carries on through the air and on landing.
 */

/** Surf speed: about 2.4× running speed (RUN_SPEED 8.5). Tune by play. */
export const SURF_SPEED = 20;
/** A landing only starts a ride after at least this long in the air, so a grounded flicker on a bumpy slope doesn't. */
export const SURF_MIN_AIR = 0.15;

export interface SurfInput {
  /** Riding last frame. */
  surfing: boolean;
  /** The idea is learned and the area is outdoors. */
  allowed: boolean;
  shield: boolean;
  /** Touched down this frame after `airTime` seconds in the air (0 if she didn't). */
  landedAfter: number;
  /** In the normal move state: not swinging, hurt, staggered or throwing. */
  free: boolean;
  locked: boolean;
  attack: boolean;
  wading: boolean;
}

/** Whether Wren surfs this frame. */
export function surfNext(s: SurfInput): boolean {
  if (!s.allowed || !s.shield || !s.free || s.locked || s.attack || s.wading) return false;
  return s.surfing || s.landedAfter >= SURF_MIN_AIR;
}
