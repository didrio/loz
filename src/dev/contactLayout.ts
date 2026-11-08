/**
 * The contact sheet's layout (pure): models sorted by kind (big ones first), packed left to right on shelves of at most
 * `maxWidth` metres, each shelf as tall as its tallest model. Shelves stack downwards from the top; `y` is the shelf's floor.
 */
export interface SheetItem {
  id: string;
  kind: string;
  w: number;
  h: number;
}
export interface SheetSlot extends SheetItem {
  x: number;
  y: number;
}

const KIND_ORDER = ['boss', 'miniboss', 'player', 'npc', 'enemy', 'prop', 'piece'];

export function layoutShelves(items: readonly SheetItem[], maxWidth: number, gap: number) {
  const sorted = [...items].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const shelves: SheetItem[][] = [[]];
  let x = 0;
  for (const it of sorted) {
    if (x > 0 && x + it.w > maxWidth) {
      shelves.push([]);
      x = 0;
    }
    shelves[shelves.length - 1].push(it);
    x += it.w + gap;
  }
  const heights = shelves.map((s) => Math.max(0, ...s.map((i) => i.h)));
  const total = heights.reduce((a, h) => a + h + gap * 1.5, 0);
  const out: SheetSlot[] = [];
  let width = 0;
  let top = total;
  shelves.forEach((shelf, si) => {
    const floor = top - heights[si];
    let sx = 0;
    for (const it of shelf) {
      out.push({ ...it, x: sx, y: floor });
      sx += it.w + gap;
    }
    width = Math.max(width, sx - gap);
    top = floor - gap * 1.5;
  });
  return { items: out, width, height: total };
}
