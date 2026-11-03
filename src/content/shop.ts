import type { Page, ScriptApi } from '../game/script';

export type Purchase = 'bought' | 'declined' | 'short';

/**
 * A merchant's offer: shows `pages` ending in a Buy / Not now choice. On Buy it takes the
 * gems (if Wren has enough) and resolves 'bought'; the caller hands over the ware.
 * Reused by every shop (the tunic now, the flask refills later).
 */
export async function offerWare(api: ScriptApi, pages: Page[], price: number, label = 'Buy'): Promise<Purchase> {
  const pick = await api.ask(pages, [`${label} (${price} gems)`, 'Not now']);
  if (pick !== 0) return 'declined';
  if (api.state.gems < price) {
    api.sfx.denied();
    return 'short';
  }
  api.state.gems -= price;
  api.sfx.select();
  return 'bought';
}
