import {
  CEIL_T, DEFAULT_DOOR_WIDTH, DIRS, DOOR_MARGIN, doorPlacement, FLOOR_T, floorHeightOf, floorY, footprintOverlap, MIN_ROOM,
  landmarkRect, lockSwitches, LANDMARK_SIZE, rectContains, rectsOverlap, roomHeight, roomOpenings, roomRect, STAIR_LANDING, stairPlacement, worldPos,
  type DungeonDef, type Rect, type RoomDef, type Vec2,
} from './format';
import { HEADROOM } from '../platforming';

/** How much clear floor a doorway needs in front of it, on both sides. */
const DOOR_APPROACH = 1.5;

/**
 * Structural checks: every mistake an author (human or AI) is likely to make when writing
 * a dungeon by hand, reported as readable messages instead of a broken level. Returns an
 * empty list when the dungeon is well-formed. Logic (keys, softlocks) is `solve.ts`'s job.
 */
export function validateDungeon(def: DungeonDef): string[] {
  const errors: string[] = [];
  const rooms = new Map<string, RoomDef>();

  // Ids are unique across rooms, doors and things: content binds scripts and saved state by id.
  const seen = new Set<string>();
  for (const id of [...def.rooms.map((r) => r.id), ...def.doors.map((d) => d.id), ...def.things.map((t) => t.id)]) {
    if (seen.has(id)) errors.push(`Duplicate id "${id}"`);
    seen.add(id);
  }
  for (const r of def.rooms) rooms.set(r.id, r);

  for (const r of def.rooms) {
    if (r.w < MIN_ROOM || r.d < MIN_ROOM) errors.push(`Room "${r.id}" is ${r.w}×${r.d} m; rooms must be at least ${MIN_ROOM}×${MIN_ROOM}`);
    if (!Number.isInteger(r.floor)) errors.push(`Room "${r.id}" floor must be a whole number`);
    for (const f of r.features ?? []) {
      const [fx, fz, fw, fd] = f.kind === 'pillar' ? [f.x, f.z, 0, 0] : [f.x, f.z, f.w, f.d];
      if (fx < 0 || fz < 0 || fx + fw > r.w || fz + fd > r.d) errors.push(`Room "${r.id}": a ${f.kind} sticks out of the room`);
    }
    for (const [i, p] of (r.platforms ?? []).entries()) {
      const range = p.move ? [p.move.by[0], p.move.by[1], p.move.by[2]] : [0, 0, 0];
      const x0 = p.x - p.w / 2 + Math.min(0, range[0]), x1 = p.x + p.w / 2 + Math.max(0, range[0]);
      const z0 = p.z - p.d / 2 + Math.min(0, range[2]), z1 = p.z + p.d / 2 + Math.max(0, range[2]);
      if (x0 < 0 || z0 < 0 || x1 > r.w || z1 > r.d) errors.push(`Room "${r.id}": platform ${i} (even sliding) sticks out of the room`);
      const top = p.top + Math.max(0, range[1]);
      if (top + HEADROOM > roomHeight(def, r)) errors.push(`Room "${r.id}": platform ${i} is too high: less than ${HEADROOM} m of headroom under the ceiling`);
    }
  }
  // Rooms on the same floor may touch (share walls) but not overlap; a room may not reach
  // up into a room built above it (its ceiling would cut through that room's floor).
  for (let i = 0; i < def.rooms.length; i++) {
    for (let j = i + 1; j < def.rooms.length; j++) {
      const a = def.rooms[i], b = def.rooms[j];
      if (!footprintOverlap(a, b)) continue;
      if (a.floor === b.floor) {
        errors.push(`Rooms "${a.id}" and "${b.id}" overlap`);
        continue;
      }
      const [lo, hi] = a.floor < b.floor ? [a, b] : [b, a];
      if (floorY(def, lo.floor) + roomHeight(def, lo) + CEIL_T > floorY(def, hi.floor) - FLOOR_T + 1e-6) {
        errors.push(`Room "${lo.id}" is too tall: it reaches into "${hi.id}" above it (max height ${floorHeightOf(def) * (hi.floor - lo.floor) - FLOOR_T - CEIL_T} m)`);
      }
    }
  }

  const room = (id: string, what: string) => {
    const r = rooms.get(id);
    if (!r) errors.push(`${what} refers to unknown room "${id}"`);
    return r;
  };
  const inside = (r: RoomDef, at: Vec2, what: string) => {
    if (at[0] < DOOR_MARGIN || at[1] < DOOR_MARGIN || at[0] > r.w - DOOR_MARGIN || at[1] > r.d - DOOR_MARGIN) {
      errors.push(`${what} at (${at[0]}, ${at[1]}) is outside room "${r.id}" (${r.w}×${r.d})`);
    }
  };

  const switches = new Set(def.things.filter((t) => t.kind === 'switch').map((t) => t.id));
  /** Floor in front of each doorway, both sides: must stay clear of stairs, holes and solid features. */
  const approaches: { id: string; rooms: RoomDef[]; rects: Rect[] }[] = [];
  for (const d of def.doors) {
    const a = room(d.from, `Door "${d.id}"`), b = room(d.to, `Door "${d.id}"`);
    if (d.from === d.to) errors.push(`Door "${d.id}" connects room "${d.from}" to itself`);
    for (const s of lockSwitches(d.lock)) if (!switches.has(s)) errors.push(`Door "${d.id}" waits for unknown switch "${s}"`);
    if (!a || !b) continue;
    // A shaft between floors is only closed if the lower room's ceiling meets the floor above.
    const flush = (lower: RoomDef, what: string) => {
      if (Math.abs(roomHeight(def, lower) - (floorHeightOf(def) - FLOOR_T - CEIL_T)) > 1e-6) {
        errors.push(`${what} "${d.id}": room "${lower.id}" must have the default height so the shaft between floors is closed`);
      }
    };
    if (d.kind === 'stairs') {
      if (Math.abs(a.floor - b.floor) !== 1) errors.push(`Stairs "${d.id}" must connect adjacent floors (${a.floor} → ${b.floor})`);
      else if (!footprintOverlap(a, b)) errors.push(`Stairs "${d.id}": rooms "${a.id}" and "${b.id}" don't overlap in plan, so there's nowhere for the stairs to go`);
      else {
        const s = stairPlacement(d, a, b)!;
        const [dx, dz] = DIRS[s.up];
        // The flight plus a landing at each end: foot in the lower room, top in the upper.
        const extend = (r: Rect, sx: number, sz: number): Rect => ({
          x: r.x + Math.min(0, sx), z: r.z + Math.min(0, sz), w: r.w + Math.abs(sx), d: r.d + Math.abs(sz),
        });
        if (!rectContains(roomRect(s.lower), extend(s.rect, -dx * STAIR_LANDING, -dz * STAIR_LANDING), DOOR_MARGIN)) {
          errors.push(`Stairs "${d.id}" (plus ${STAIR_LANDING} m at the foot) don't fit inside room "${s.lower.id}"`);
        }
        if (!rectContains(roomRect(s.upper), extend(s.rect, dx * STAIR_LANDING, dz * STAIR_LANDING), DOOR_MARGIN)) {
          errors.push(`Stairs "${d.id}" (plus ${STAIR_LANDING} m at the top) don't fit inside room "${s.upper.id}"`);
        }
        flush(s.lower, 'Stairs');
      }
      continue;
    }
    if (d.kind === 'drop') {
      if (a.floor - b.floor !== 1) errors.push(`Drop "${d.id}" must go from a floor to the one directly below (${a.floor} → ${b.floor})`);
      else if (!footprintOverlap(a, b)) errors.push(`Drop "${d.id}": rooms "${a.id}" and "${b.id}" don't overlap in plan, so the hole leads nowhere`);
      else flush(b, 'Drop');
      continue;
    }
    if (a.floor !== b.floor) {
      errors.push(`Door "${d.id}" joins different floors; use kind: 'stairs'`);
      continue;
    }
    const p = doorPlacement(a, b, d);
    if (!p) {
      errors.push(`Door "${d.id}": rooms "${a.id}" and "${b.id}" don't share a wall`);
      continue;
    }
    const half = (d.width ?? DEFAULT_DOOR_WIDTH) / 2;
    const along = d.offset ?? p.shared / 2;
    if (along - half < DOOR_MARGIN || along + half > p.shared - DOOR_MARGIN) {
      errors.push(`Door "${d.id}" (${half * 2} m wide) doesn't fit on the ${p.shared} m wall "${a.id}" and "${b.id}" share`);
    }
    approaches.push({ id: d.id, rooms: [a, b], rects: p.wall === 'z'
      ? [{ x: p.x - DOOR_APPROACH, z: p.z - half, w: DOOR_APPROACH, d: half * 2 }, { x: p.x, z: p.z - half, w: DOOR_APPROACH, d: half * 2 }]
      : [{ x: p.x - half, z: p.z - DOOR_APPROACH, w: half * 2, d: DOOR_APPROACH }, { x: p.x - half, z: p.z, w: half * 2, d: DOOR_APPROACH }] });
  }

  // Holes and stairs in a room can't overlap each other, pits can't open into a room below,
  // and nothing can stand on a hole or a staircase.
  const openings = new Map(def.rooms.map((r) => [r.id, roomOpenings(def, r)]));
  for (const r of def.rooms) {
    const { holes, stairs } = openings.get(r.id)!;
    const all = [...holes.map((h) => ({ rect: h.rect, id: h.id })), ...stairs];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (rectsOverlap(all[i].rect, all[j].rect)) errors.push(`In room "${r.id}", "${all[i].id}" and "${all[j].id}" overlap`);
      }
    }
    for (const f of r.features ?? []) {
      if (f.kind === 'pit') continue;
      const rr = f.kind === 'pillar' ? (f.r ?? 0.7) : 0;
      const rect: Rect = f.kind === 'pillar'
        ? { x: r.x + f.x - rr, z: r.z + f.z - rr, w: rr * 2, d: rr * 2 }
        : { x: r.x + f.x, z: r.z + f.z, w: f.w, d: f.d };
      for (const o of all) if (rectsOverlap(o.rect, rect)) errors.push(`In room "${r.id}", a ${f.kind} overlaps "${o.id}"`);
    }
    for (const ap of approaches) {
      if (!ap.rooms.includes(r)) continue;
      const marks = def.things.flatMap((t) => (t.kind === 'landmark' && t.room === r.id ? [{ id: `a landmark "${t.id}"`, rect: landmarkRect(r, t.at) }] : []));
      const ledges = (r.platforms ?? []).map((p, i) => ({ id: `a platform (${i})`, rect: { x: r.x + p.x - p.w / 2, z: r.z + p.z - p.d / 2, w: p.w, d: p.d } }));
      const blockers = [...all, ...marks, ...ledges, ...(r.features ?? []).filter((f) => f.kind !== 'pit').map((f) => ({
        id: `a ${f.kind}`,
        rect: f.kind === 'pillar' ? { x: r.x + f.x - (f.r ?? 0.7), z: r.z + f.z - (f.r ?? 0.7), w: (f.r ?? 0.7) * 2, d: (f.r ?? 0.7) * 2 } : { x: r.x + f.x, z: r.z + f.z, w: f.w, d: f.d },
      }))];
      for (const o of blockers) {
        if (ap.rects.some((q) => rectsOverlap(q, o.rect))) errors.push(`Door "${ap.id}" opens straight into ${o.id.startsWith('a ') ? o.id : `"${o.id}"`} in room "${r.id}" (keep ${DOOR_APPROACH} m in front of doorways clear)`);
      }
    }
    for (const h of holes) {
      if (h.kind !== 'pit') continue;
      const below = def.rooms.find((o) => o.floor === r.floor - 1 && rectsOverlap(roomRect(o), h.rect));
      if (below) errors.push(`A pit in room "${r.id}" would open into room "${below.id}" below; use a drop instead`);
    }
  }

  for (const t of def.things) {
    const r = room(t.room, `${t.kind} "${t.id}"`);
    if (r && t.kind !== 'boss') {
      inside(r, t.at, `${t.kind} "${t.id}"`);
      const [x, z] = worldPos(r, t.at);
      // Stones and plates sit on the 2 m grid: cell centers are at odd coordinates.
      if ((t.kind === 'stone' || (t.kind === 'switch' && t.style === 'plate')) && (Math.abs(t.at[0] % 2) !== 1 || Math.abs(t.at[1] % 2) !== 1)) {
        errors.push(`${t.kind} "${t.id}" at (${t.at[0]}, ${t.at[1]}) isn't on the 2 m grid (use odd coordinates)`);
      }
      if (t.kind === 'stone' && (r.w % 2 || r.d % 2)) errors.push(`Room "${r.id}" has stones, so its size must be whole cells (even meters)`);
      const half = t.kind === 'stone' ? 1 : t.kind === 'landmark' ? LANDMARK_SIZE / 2 : 0.4;
      const spot: Rect = { x: x - half, z: z - half, w: half * 2, d: half * 2 };
      const { holes, stairs } = openings.get(r.id)!;
      for (const o of [...holes, ...stairs]) {
        if (rectsOverlap(o.rect, spot)) errors.push(`${t.kind} "${t.id}" stands on "${o.id}"`);
      }
      // Enemies start on level ground a body's width clear of a flight, never on or beside it.
      if (t.kind === 'enemy') {
        const wide: Rect = { x: x - 1.5, z: z - 1.5, w: 3, d: 3 };
        for (const o of stairs) {
          if (rectsOverlap(o.rect, wide) && !rectsOverlap(o.rect, spot)) errors.push(`enemy "${t.id}" is too close to the stairs "${o.id}" (keep it 1.5 m clear)`);
        }
      }
    }
    if (r && t.kind === 'landmark') {
      // A statue is solid: it can't stand in a wall, on a pillar or block, or on another thing.
      const me = landmarkRect(r, t.at);
      if (!rectContains(roomRect(r), me, DOOR_MARGIN)) errors.push(`landmark "${t.id}" sticks out of room "${r.id}"`);
      for (const f of r.features ?? []) {
        if (f.kind === 'pit') continue;
        const rr = f.kind === 'pillar' ? (f.r ?? 0.7) : 0;
        const fr: Rect = f.kind === 'pillar' ? { x: r.x + f.x - rr, z: r.z + f.z - rr, w: rr * 2, d: rr * 2 } : { x: r.x + f.x, z: r.z + f.z, w: f.w, d: f.d };
        if (rectsOverlap(fr, me)) errors.push(`landmark "${t.id}" overlaps a ${f.kind} in room "${r.id}"`);
      }
      for (const o of def.things) {
        if (o === t || o.room !== r.id || o.kind === 'boss') continue;
        const [ox, oz] = o.kind === 'landmark' ? [0, 0] : worldPos(r, o.at);
        const oh = o.kind === 'stone' ? 1 : o.kind === 'enemy' ? 0.8 : 0.4;
        const or: Rect = o.kind === 'landmark' ? landmarkRect(r, o.at) : { x: ox - oh, z: oz - oh, w: oh * 2, d: oh * 2 };
        if (rectsOverlap(or, me)) errors.push(`landmark "${t.id}" overlaps ${o.kind} "${o.id}"`);
      }
      if (def.entrance.room === r.id) {
        const [ex, ez] = worldPos(r, def.entrance.at);
        if (rectsOverlap({ x: ex - 1, z: ez - 1, w: 2, d: 2 }, me)) errors.push(`landmark "${t.id}" stands at the dungeon entrance`);
      }
    }
    if (t.kind === 'chest' && t.appears) {
      const waits = 'switch' in t.appears ? [t.appears.switch] : 'switches' in t.appears ? t.appears.switches : [];
      for (const w of waits) if (!switches.has(w)) errors.push(`Chest "${t.id}" waits for unknown switch "${w}"`);
      if ('cleared' in t.appears) room(t.appears.cleared, `Chest "${t.id}"`);
    }
  }

  // A bell has one post and one resting place in the whole game; a dungeon can't hold two.
  for (const kind of ['bellPost', 'bell'] as const) {
    const seen = new Set<string>();
    for (const t of def.things) {
      if (t.kind !== kind) continue;
      if (seen.has(t.bell)) errors.push(`Two ${kind === 'bell' ? 'bells' : 'posts'} for the bell "${t.bell}"`);
      seen.add(t.bell);
    }
  }

  // Colored keys: one chest and one door per color, so a key can never be spare or missing.
  const keyColors = new Set<string>([
    ...def.doors.flatMap((d) => (d.lock && typeof d.lock === 'object' && 'key' in d.lock ? [d.lock.key] : [])),
    ...def.things.flatMap((t) => (t.kind === 'chest' && typeof t.loot === 'object' && 'key' in t.loot ? [t.loot.key] : [])),
  ]);
  for (const c of keyColors) {
    const doors = def.doors.filter((d) => d.lock && typeof d.lock === 'object' && 'key' in d.lock && d.lock.key === c).length;
    const chests = def.things.filter((t) => t.kind === 'chest' && typeof t.loot === 'object' && 'key' in t.loot && t.loot.key === c).length;
    if (doors !== 1 || chests !== 1) errors.push(`The ${c} key needs exactly one chest and one door (has ${chests} chest${chests === 1 ? '' : 's'}, ${doors} door${doors === 1 ? '' : 's'})`);
  }

  const entry = room(def.entrance.room, 'The entrance');
  if (entry) inside(entry, def.entrance.at, 'The entrance');
  room(def.goal, 'The goal');
  return errors;
}
