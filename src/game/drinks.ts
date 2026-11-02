import type { DrinkId } from '../world/dungeon/format';

/**
 * Drinks: single-use pick-me-ups found in dungeon chests. Each one you've *found* is yours
 * for good; drinking it spends it until you die, when every drink you've found refills (the
 * game's checkpoint rule: death costs you your progress through the rooms, not your finds).
 * New kinds: add an id to `DrinkId`, an entry here, and its effect in `Game.drink`.
 */
export const DRINKS: Record<DrinkId, { name: string; text: string; color: string }> = {
  restore: { name: 'Restoring Draught', text: 'Restores every heart.', color: '#ff5470' },
  attack: { name: 'Ember Tonic', text: 'Doubles your sword\'s strength for 30 seconds.', color: '#ffb02e' },
};

/** The order they're shown in, and their buttons (1, 2...). */
export const DRINK_ORDER: DrinkId[] = ['restore', 'attack'];

/** Seconds an Ember Tonic lasts, and how much harder the sword hits meanwhile. */
export const ATTACK_BOOST_SECONDS = 30;
export const ATTACK_BOOST = 2;

export class Drinks {
  /** How many of each have been found (the refill level). */
  readonly found = new Map<DrinkId, number>();
  /** How many are left to drink right now. */
  readonly left = new Map<DrinkId, number>();

  /** A new one from a chest: it's yours, and full. */
  add(id: DrinkId) {
    this.found.set(id, (this.found.get(id) ?? 0) + 1);
    this.left.set(id, (this.left.get(id) ?? 0) + 1);
  }

  /** Drinks one if there's one left; returns whether it did. */
  use(id: DrinkId) {
    const n = this.left.get(id) ?? 0;
    if (n <= 0) return false;
    this.left.set(id, n - 1);
    return true;
  }

  /** After a death: every drink found is back. */
  refill() {
    for (const [id, n] of this.found) this.left.set(id, n);
  }

  clear() {
    this.found.clear();
    this.left.clear();
  }

  toSave(): Record<string, { found: number; left: number }> {
    return Object.fromEntries([...this.found].map(([id, n]) => [id, { found: n, left: Math.min(n, this.left.get(id) ?? 0) }]));
  }

  load(d: Record<string, { found: number; left: number }>) {
    this.clear();
    for (const [id, v] of Object.entries(d)) {
      if (!(id in DRINKS)) continue;
      this.found.set(id as DrinkId, v.found);
      this.left.set(id as DrinkId, Math.min(v.found, v.left));
    }
  }
}
