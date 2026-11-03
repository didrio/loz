import { DEFAULT_DOOR_WIDTH, doorPlacement, dropHole, lockName, stairPlacement, worldPos, type DungeonDef, type Loot, type RoomDef } from './format';

/**
 * Draws a dungeon as a text map, one block per floor: how an agent (or the owner) "sees"
 * a layout without rendering anything. One character is 1 m east–west and one line is
 * 2 m north–south (terminal characters are about twice as tall as wide). North is up.
 *
 *   #  wall             k  key door    B  boss door      s  switch door
 *   i  item door        >  one-way door (arrow points the way you can go)
 *   U  a flight of stairs (on the lower floor)   D  its shaft (on the floor above)
 *   @  entrance         C  chest             S  crystal switch
 *   P  floor plate      %  wakestone (& heavy)  e  enemy       X  boss
 *   ?  sign             O  pit               =  block           I  pillar
 *   L  landmark statue (3 m square, marked at its center)
 *   Y  bell post, A  a bell waiting to be taken (docs/bells.md)
 *   v  a drop hole (on the floor above)      *  where it lands (below)
 *
 * Room ids are written inside each room; open doorways are gaps in the wall. A list of
 * chest contents and locked doors follows the drawing.
 */
export function dungeonMap(def: DungeonDef): string {
  const rooms = new Map(def.rooms.map((r) => [r.id, r]));
  const floors = [...new Set(def.rooms.map((r) => r.floor))].sort((a, b) => b - a);
  const blocks = floors.map((f) => drawFloor(def, rooms, f));
  return [`${def.name} (${def.id})`, ...blocks, legendList(def, rooms)].join('\n\n');
}

function drawFloor(def: DungeonDef, rooms: Map<string, RoomDef>, floor: number) {
  const here = def.rooms.filter((r) => r.floor === floor);
  const minX = Math.min(...here.map((r) => r.x)), maxX = Math.max(...here.map((r) => r.x + r.w));
  const minZ = Math.min(...here.map((r) => r.z)), maxZ = Math.max(...here.map((r) => r.z + r.d));
  const col = (x: number) => Math.round(x - minX);
  const row = (z: number) => Math.round((z - minZ) / 2);
  const grid = Array.from({ length: row(maxZ) + 1 }, () => Array<string>(col(maxX) + 1).fill(' '));
  const put = (x: number, z: number, ch: string) => {
    const r = grid[row(z)];
    if (r && col(x) >= 0 && col(x) < r.length) r[col(x)] = ch;
  };
  const fill = (x: number, z: number, w: number, d: number, ch: string) => {
    for (let c = col(x); c < Math.max(col(x) + 1, col(x + w)); c++) {
      for (let r = row(z); r < Math.max(row(z) + 1, row(z + d)); r++) if (grid[r]?.[c] !== undefined) grid[r][c] = ch;
    }
  };

  // Features first, then walls over them (a pit may run wall to wall).
  for (const r of here) {
    for (const f of r.features ?? []) {
      if (f.kind === 'pillar') put(r.x + f.x, r.z + f.z, 'I');
      else fill(r.x + f.x, r.z + f.z, f.w, f.d, f.kind === 'pit' ? 'O' : '=');
    }
  }
  for (const r of here) {
    for (let c = col(r.x); c <= col(r.x + r.w); c++) grid[row(r.z)][c] = grid[row(r.z + r.d)][c] = '#';
    for (let rr = row(r.z); rr <= row(r.z + r.d); rr++) grid[rr][col(r.x)] = grid[rr][col(r.x + r.w)] = '#';
  }

  for (const d of def.doors) {
    const a = rooms.get(d.from), b = rooms.get(d.to);
    if (!a || !b) continue;
    if (d.kind === 'drop') {
      const h = dropHole(d, a, b);
      if (h && a.floor === floor) fill(h.x, h.z, h.w, h.d, 'v');
      if (h && b.floor === floor) put(h.x + h.w / 2, h.z + h.d / 2, '*');
      continue;
    }
    if (d.kind === 'stairs') {
      const s = stairPlacement(d, a, b);
      if (s && s.lower.floor === floor) fill(s.rect.x, s.rect.z, s.rect.w, s.rect.d, 'U');
      if (s && s.upper.floor === floor) fill(s.rect.x, s.rect.z, s.rect.w, s.rect.d, 'D');
      continue;
    }
    if (a.floor !== floor) continue;
    const p = doorPlacement(a, b, d);
    if (!p) continue;
    const half = (d.width ?? DEFAULT_DOOR_WIDTH) / 2;
    let ch = d.lock === 'boss' ? 'B' : d.lock ? ('key' in d.lock ? 'k' : 'item' in d.lock ? 'i' : 'cleared' in d.lock ? 'c' : 's') : ' ';
    if (d.oneWay) ch = p.wall === 'z' ? (b.x > a.x ? '>' : '<') : (b.z > a.z ? 'v' : '^');
    if (p.wall === 'z') {
      for (let r = row(p.z - half); r < Math.max(row(p.z - half) + 1, row(p.z + half)); r++) if (grid[r]) grid[r][col(p.x)] = ch;
    } else {
      for (let c = col(p.x - half); c < col(p.x + half); c++) grid[row(p.z)][c] = ch;
    }
  }

  for (const t of def.things) {
    const r = rooms.get(t.room);
    if (!r || r.floor !== floor) continue;
    if (t.kind === 'boss') put(r.x + r.w / 2, r.z + r.d / 2, 'X');
    else {
      const [x, z] = worldPos(r, t.at);
      const ch = { chest: 'C', switch: t.kind === 'switch' && t.style === 'plate' ? 'P' : 'S', stone: t.kind === 'stone' && t.heavy ? '&' : '%', enemy: 'e', sign: '?', sigil: '*', landmark: 'L', bellPost: 'Y', bell: 'A' }[t.kind];
      put(x, z, ch);
    }
  }
  const entry = rooms.get(def.entrance.room);
  if (entry?.floor === floor) put(...worldPos(entry, def.entrance.at), '@');

  // Room ids last, and only into empty cells: what's in the room matters more than its name.
  for (const r of here) {
    const lr = grid[row(r.z) + 1];
    if (!lr || row(r.z) + 1 >= row(r.z + r.d)) continue;
    const label = r.id.slice(0, Math.max(0, col(r.x + r.w) - col(r.x) - 2));
    [...label].forEach((ch, i) => {
      if (lr[col(r.x) + 1 + i] === ' ') lr[col(r.x) + 1 + i] = ch;
    });
  }

  const name = floor === 0 ? 'Floor 0 (entrance level)' : floor > 0 ? `Floor ${floor} (up)` : `Floor ${floor} (down)`;
  return [name, ...grid.map((r) => r.join('').trimEnd())].join('\n');
}

function lootName(l: Loot) {
  if (typeof l === 'string') return 'boss key';
  if ('key' in l) return `${l.key} key`;
  if ('flask' in l) return `flask: ${l.flask}`;
  return 'item' in l ? `item: ${l.item}` : `${l.gems} gems`;
}

function legendList(def: DungeonDef, rooms: Map<string, RoomDef>) {
  const lines = ['Chests:'];
  for (const t of def.things) {
    if (t.kind !== 'chest') continue;
    const a = t.appears;
    const when = !a ? '' : 'switch' in a ? ` (appears: switch ${a.switch})` : 'switches' in a ? ` (appears: switches ${a.switches.join(' + ')})` : ` (appears: ${a.cleared} cleared)`;
    lines.push(`  ${t.id} in ${t.room}: ${lootName(t.loot)}${when}`);
  }
  lines.push('Locked or special doors:');
  for (const d of def.doors) {
    if (!d.lock && !d.oneWay && (!d.kind || d.kind === 'door')) continue;
    const bits = [d.kind === 'stairs' || d.kind === 'drop' ? d.kind : null, d.lock ? lockName(d.lock) : null, d.oneWay ? 'one-way' : null].filter(Boolean);
    lines.push(`  ${d.id}: ${d.from} → ${d.to} (${bits.join(', ')})`);
  }
  lines.push(`Entrance: ${def.entrance.room} · Goal: ${def.goal}${rooms.has(def.goal) ? '' : ' (missing!)'}`);
  return lines.join('\n');
}
