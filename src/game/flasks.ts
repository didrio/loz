/**
 * Flasks: bottles Wren finds full in dungeon chests (there are exactly two in the game).
 * Each holds one potion, life or attack; drinking empties it, and it stays empty (death
 * does not refill it) until Odo fills it again for gems, with whichever potion Wren picks.
 * New potions: add an id to `Potion`, an entry here, and its effect in `Game.drink`.
 */
import type { Potion } from '../world/dungeon/format';

export type { Potion };

export const POTIONS: Record<Potion, { name: string; color: string }> = {
  life: { name: 'Life Potion', color: '#ff5470' },
  attack: { name: 'Attack Potion', color: '#ffb02e' },
};

export const isPotion = (v: unknown): v is Potion => v === 'life' || v === 'attack';

/** How many flasks Wren can carry (one button each: 1, 2). */
export const MAX_FLASKS = 2;

/** Seconds an attack potion lasts, and how much harder the sword hits meanwhile. */
export const ATTACK_BOOST_SECONDS = 30;
export const ATTACK_BOOST = 2;

/** What a refill costs at Odo's stall. */
export const REFILL_PRICE = 20;

export class Flasks {
  /** One entry per flask owned, in the order found: its potion, or null when empty. */
  readonly slots: (Potion | null)[] = [];

  /** A new flask from a chest: it's yours, and full. */
  add(p: Potion) {
    if (this.slots.length < MAX_FLASKS) this.slots.push(p);
  }

  /** Drinks flask `i` if it holds anything: returns the potion drunk, or null. */
  drink(i: number): Potion | null {
    const p = this.slots[i] ?? null;
    if (p) this.slots[i] = null;
    return p;
  }

  /** The first empty flask, or -1. */
  firstEmpty() {
    return this.slots.indexOf(null);
  }

  /** Fills flask `i` (it must be owned). */
  fill(i: number, p: Potion) {
    if (i >= 0 && i < this.slots.length) this.slots[i] = p;
  }

  clear() {
    this.slots.length = 0;
  }

  toSave(): (Potion | null)[] {
    return [...this.slots];
  }

  /** From a save: unknown potions read as empty, extra flasks are dropped. */
  load(d: (string | null)[]) {
    this.clear();
    for (const p of d.slice(0, MAX_FLASKS)) this.slots.push(isPotion(p) ? p : null);
  }
}
