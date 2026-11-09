import { beforeAll, describe, expect, it } from 'vitest';
import { createArea } from '../../content/areas';
import { initPhysics, Physics } from '../../core/physics';
import { FOOT_BAND, STONE_TOP, WALL_PIECE_LOW } from '../../render/models/shrineDressing';
import type { DungeonArea } from './build';
import { SHRINE } from './defs/shrine';
import { worldPos } from './format';
import { HALL, planHallDressing, wallFrame, wallPoint, CLEAR, type WallPiece } from './hallDressing';

let a: DungeonArea;
let plan: ReturnType<typeof planHallDressing>;
let sconces: { room: string; x: number; z: number }[];
let faces: { room: string; x: number; z: number }[];

beforeAll(async () => {
  await initPhysics();
  a = createArea('shrine', new Physics()).area as unknown as DungeonArea;
  plan = a.hallDressing!.plan;
  sconces = a.sconceSpots.filter((s) => s.room === hall.id);
  faces = a.faceSpots.filter((f) => f.room === hall.id);
});

const hall = SHRINE.rooms.find((r) => r.id === HALL.room)!;

describe("the Hall of Sleepers' dressing", () => {
  it('is built into the shrine, and everything planned fits', () => {
    expect(a.hallDressing).not.toBeNull();
    expect(plan.dropped.map((p) => `${p.kind} ${p.wall} ${p.along}`)).toEqual([]);
  });

  it('has what the ticket asks for', () => {
    const count = (k: string) => plan.walls.filter((p) => p.kind === k).length;
    expect(count('relief')).toBeGreaterThanOrEqual(2);
    expect(count('niche')).toBeGreaterThanOrEqual(2);
    expect(count('niche')).toBeLessThanOrEqual(3);
    expect(count('banner')).toBeGreaterThanOrEqual(4);
    expect(count('rubble')).toBeGreaterThanOrEqual(3);
    expect(count('drift')).toBeGreaterThanOrEqual(3);
    // A carved lintel over each doorway of the Hall: east into the Nave, south to the Gallery, west the dungeon's entrance.
    expect(plan.walls.filter((p) => p.kind === 'lintel').map((p) => p.wall).sort()).toEqual(['E', 'S', 'W']);
    expect(plan.decals.filter((d) => d.kind === 'crack').length).toBeGreaterThanOrEqual(3);
    expect(plan.decals.filter((d) => d.kind === 'sunken').length).toBeGreaterThanOrEqual(2);
  });

  const ends = (p: WallPiece): [number, number] => [p.along - p.half, p.along + p.half];

  it('keeps everything on a wall above the tallest wakestone and the string course', () => {
    for (const p of plan.walls.filter((q) => q.low > 0.3)) {
      expect(p.low, `${p.kind} on ${p.wall}`).toBeGreaterThanOrEqual(p.kind === 'banner' ? WALL_PIECE_LOW : STONE_TOP);
    }
    for (const p of plan.walls.filter((q) => ['relief', 'niche'].includes(q.kind))) expect(p.low).toBeGreaterThanOrEqual(WALL_PIECE_LOW);
  });

  it("keeps the floor's dressing in the wall's foot band", () => {
    for (const p of plan.walls.filter((q) => q.low < STONE_TOP)) {
      expect(p.out, `${p.kind} on ${p.wall}`).toBeLessThanOrEqual(FOOT_BAND);
      expect(['rubble', 'drift']).toContain(p.kind);
    }
  });

  it('keeps clear of the doorways, the corners, the faces and the sconces', () => {
    for (const p of plan.walls) {
      const f = wallFrame(hall, p.wall), [lo, hi] = ends(p);
      if (p.kind !== 'lintel') {
        expect(lo, `${p.kind} ${p.wall} ${p.along}`).toBeGreaterThanOrEqual(f.a0 + CLEAR.corner);
        expect(hi, `${p.kind} ${p.wall} ${p.along}`).toBeLessThanOrEqual(f.a1 - CLEAR.corner);
        for (const [g0, g1] of a.hallDoorGaps(f.key)) expect(lo >= g1 + CLEAR.door || hi <= g0 - CLEAR.door, `${p.kind} ${p.wall} ${p.along} vs a doorway`).toBe(true);
      }
      if (p.low >= STONE_TOP && p.kind !== 'lintel') {
        for (const s of [...sconces, ...faces]) {
          const onThisWall = Math.abs((f.axis === 'x' ? s.z : s.x) - f.line) < 0.8;
          if (!onThisWall) continue;
          const at = f.axis === 'x' ? s.x : s.z;
          expect(Math.abs(at - p.along), `${p.kind} ${p.wall} ${p.along} vs a spot at ${at}`).toBeGreaterThanOrEqual(p.half + 0.3);
        }
      }
    }
  });

  it("keeps the floor's pieces away from the bell post and the tablet", () => {
    const solids = [
      { x: 10 - 1.5, z: 9 - 1.5, w: 3, d: 3 }, // the bell post and a stride round it
      { x: 4 - 1.2, z: 2 - 1, w: 2.4, d: 2 }, // the tablet and a stride round it
    ];
    for (const p of plan.walls.filter((q) => q.low < STONE_TOP)) {
      const c0 = wallPoint(hall, p.wall, p.along - p.half), c1 = wallPoint(hall, p.wall, p.along + p.half, FOOT_BAND);
      const [x0, x1, z0, z1] = [Math.min(c0.x, c1.x), Math.max(c0.x, c1.x), Math.min(c0.z, c1.z), Math.max(c0.z, c1.z)];
      for (const s of solids) expect(x0 < s.x + s.w && s.x < x1 && z0 < s.z + s.d && s.z < z1, `${p.kind} ${p.wall} ${p.along}`).toBe(false);
    }
  });

  it("lays flat decals only on flags no stone, door, bell post, tablet or first step uses", () => {
    const bad = new Set<string>();
    const mark = (x: number, z: number) => bad.add(`${Math.floor((x - hall.x) / 2)},${Math.floor((z - hall.z) / 2)}`);
    for (const t of SHRINE.things) if (t.room === hall.id && (t.kind === 'stone' || t.kind === 'sign' || t.kind === 'bellPost')) mark(...worldPos(hall, t.at));
    mark(...worldPos(hall, SHRINE.entrance.at));
    for (const d of SHRINE.doors.filter((q) => q.from === hall.id || q.to === hall.id)) {
      // Just inside each doorway of the Hall.
      for (const wall of ['N', 'S', 'E', 'W'] as const) for (const [g0, g1] of a.hallDoorGaps(wallFrame(hall, wall).key)) if (d) for (const along of [g0 + 0.1, (g0 + g1) / 2, g1 - 0.1]) { const q = wallPoint(hall, wall, along, 0.6); mark(q.x, q.z); }
    }
    for (const d of plan.decals) expect(bad.has(`${d.cell.i},${d.cell.j}`), `${d.kind} on cell ${d.cell.i},${d.cell.j}`).toBe(false);
  });

  it('is the same every time (no random numbers)', () => {
    const again = planHallDressing(SHRINE, hall, (k) => a.hallDoorGaps(k), sconces, faces);
    expect(again.walls).toEqual(plan.walls);
    expect(again.decals).toEqual(plan.decals);
  });
});
