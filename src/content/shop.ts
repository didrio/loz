import type { Page, ScriptApi } from '../game/script';

export interface Ware {
  /** The choice's label; the price is added: "Life Potion (20 gems)". */
  label: string;
  price: number;
}

/** Which ware was bought (its index), or why not. */
export type Purchase = { bought: number } | { short: Ware } | 'declined';

/**
 * A merchant's offer: shows `pages` ending in a choice of `wares` plus "Not now". On a pick
 * it takes the gems (if Wren has enough) and resolves which ware; the caller hands it over.
 * Every shop uses it (Odo's tunic and flask refills).
 */
export async function offerWares(api: ScriptApi, pages: Page[], wares: Ware[]): Promise<Purchase> {
  const pick = await api.ask(pages, [...wares.map((w) => `${w.label} (${w.price} gems)`), 'Not now']);
  const ware = wares[pick];
  if (!ware) return 'declined';
  if (api.state.gems < ware.price) {
    api.sfx.denied();
    return { short: ware };
  }
  api.state.gems -= ware.price;
  api.sfx.select();
  return { bought: pick };
}
