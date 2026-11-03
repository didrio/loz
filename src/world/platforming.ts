import * as THREE from 'three';
import { Layer } from '../core/physics';
import { mat } from '../render/materials';
import type { AreaBuilder } from './area';

/**
 * Platforming courses (docs/bells.md): boxes to jump between, some sliding back and forth.
 * A course is data; `checkCourse` proves it can be finished, `buildCourse` makes it solid.
 */

/** A box platform. x/z are its centre; `top` is the height of its walking surface. */
export interface PlatformDef {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  /** Slab depth below `top` (default 1). */
  thickness?: number;
  /** Color (0xRRGGBB); the course's look if omitted. */
  look?: number;
  /** Falling below `fallY` returns Wren to the last checkpoint touched. */
  checkpoint?: boolean;
  /** Slides to `by` and back: a smooth cosine wave, `phase` 0..1 of a period. */
  move?: { by: [number, number, number]; period: number; phase: number };
}

export interface CourseDef {
  platforms: PlatformDef[];
  /** Plan position (x, z) where Wren starts; must lie on a platform. */
  start: [number, number];
  /** Plan position (x, z) of the goal; must lie on a platform. */
  goal: [number, number];
  /** Below this height Wren has fallen. */
  fallY: number;
}

/** Courses by id, each checked by `npm run check`. */
export const COURSES: Record<string, CourseDef> = {};

/** Where a mover is (offset from its resting box) at `t` seconds. Static platforms give zeros. */
export function platformPosition(def: PlatformDef, t: number): [number, number, number] {
  const m = def.move;
  if (!m) return [0, 0, 0];
  const s = (1 - Math.cos(2 * Math.PI * (t / m.period + m.phase))) / 2;
  return [m.by[0] * s, m.by[1] * s, m.by[2] * s];
}

// Wren's numbers, mirrored from game/player.ts (jump speed in the jump, GRAVITY, RUN_SPEED,
// radius). world/ can't import game/, so keep these in step by hand.
const JUMP_SPEED = 11;
const GRAVITY = 30;
const RUN_SPEED = 8.5;
/** Fraction of the true jump a course may ask for. */
const MARGIN = 0.85;
/** Headroom Wren needs above a platform's surface (capsule height plus a little). */
export const HEADROOM = 2.2;

/** The highest step up Wren can be asked to jump (with margin). */
export const MAX_RISE = ((JUMP_SPEED ** 2) / (2 * GRAVITY)) * MARGIN;

/**
 * The widest horizontal gap (edge to edge) Wren can be asked to jump onto a platform `rise`
 * metres higher (negative: lower), at a run, with a safety margin. 0 if it is too high.
 */
export function jumpReach(rise: number): number {
  if (rise > MAX_RISE) return 0;
  const disc = JUMP_SPEED ** 2 - 2 * GRAVITY * rise;
  const airtime = (JUMP_SPEED + Math.sqrt(disc)) / GRAVITY; // the later time at that height
  return RUN_SPEED * airtime * MARGIN;
}

export interface Hop { from: number; to: number; gap: number; rise: number }
export interface CourseReport { ok: boolean; problems: string[]; hardest: Hop }

const SAMPLES = 8;
interface Box { x: number; z: number; w: number; d: number; top: number }

/** The positions a platform takes: one if static, else sampled along its path (ends included). */
function poses(p: PlatformDef): Box[] {
  const out: Box[] = [];
  const n = p.move ? SAMPLES : 0;
  for (let k = 0; k <= n; k++) {
    const s = n ? k / n : 0;
    const by = p.move?.by ?? [0, 0, 0];
    out.push({ x: p.x + by[0] * s, z: p.z + by[2] * s, w: p.w, d: p.d, top: p.top + by[1] * s });
  }
  return out;
}

const planGap = (a: Box, b: Box) => Math.hypot(
  Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2),
  Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2),
);

const contains = (b: Box, x: number, z: number) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2;

/** How hard a hop is: gap over reach (1 = right at the limit); Infinity if impossible. */
function hardness(gap: number, rise: number) {
  const reach = jumpReach(rise);
  return reach <= 0 ? (gap === 0 && rise <= MAX_RISE ? 0 : Infinity) : gap / reach;
}

/**
 * Proves a course can be finished: from the start, Wren can reach every checkpoint and the
 * goal, and from every checkpoint (where a fall returns her) the goal. A mover counts when
 * some sampled position of it (and of the platform it joins) makes the hop possible: Wren
 * waits for it. Also flags a platform hanging too low above another.
 */
export function checkCourse(course: CourseDef): CourseReport {
  const problems: string[] = [];
  const ps = course.platforms;
  const all = ps.map(poses);
  const none: Hop = { from: -1, to: -1, gap: 0, rise: 0 };
  const at = (x: number, z: number) => ps.findIndex((_, i) => contains(all[i][0], x, z));
  const start = at(...course.start), goal = at(...course.goal);
  if (start < 0) problems.push(`The start (${course.start}) isn't on a platform`);
  if (goal < 0) problems.push(`The goal (${course.goal}) isn't on a platform`);

  // Headroom: a platform above another must clear Wren standing on it.
  for (let i = 0; i < ps.length; i++) for (let j = 0; j < ps.length; j++) {
    if (i === j) continue;
    const thick = ps[i].thickness ?? 1;
    let bad = false;
    for (const a of all[i]) for (const b of all[j]) {
      const overlap = planGap(a, b) === 0 && Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
      const room = a.top - thick - b.top;
      if (overlap && room >= 0 && room < HEADROOM) bad = true;
    }
    if (bad) problems.push(`Platform ${i} hangs less than ${HEADROOM} m of headroom above platform ${j}`);
  }

  // The easiest hop between each ordered pair (best sampled poses), then bottleneck paths.
  const n = ps.length;
  const hop = (i: number, j: number): { h: number; hop: Hop } => {
    let best = { h: Infinity, hop: { from: i, to: j, gap: Infinity, rise: 0 } as Hop };
    for (const a of all[i]) for (const b of all[j]) {
      const gap = planGap(a, b), rise = b.top - a.top;
      const h = hardness(gap, rise);
      if (h < best.h || (h === best.h && gap < best.hop.gap)) best = { h, hop: { from: i, to: j, gap, rise } };
    }
    return best;
  };
  const edges: { h: number; hop: Hop }[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? { h: Infinity, hop: none } : hop(i, j))));

  /** Easiest-bottleneck routes from `src`: cost[j] is the hardest hop on the best path. */
  const route = (src: number) => {
    const cost = Array.from({ length: n }, () => Infinity), prev = Array.from({ length: n }, () => -1), done = Array.from({ length: n }, () => false);
    cost[src] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (let v = 0; v < n; v++) {
        const e = edges[u][v];
        if (e.h > 1) continue;
        const c = Math.max(cost[u], e.h);
        if (c < cost[v]) { cost[v] = c; prev[v] = u; }
      }
    }
    return { cost, prev };
  };

  let hardest = none, hardestH = -1;
  const note = (r: ReturnType<typeof route>, target: number) => {
    for (let v = target; r.prev[v] >= 0; v = r.prev[v]) {
      const e = edges[r.prev[v]][v];
      if (e.h > hardestH) { hardestH = e.h; hardest = e.hop; }
    }
  };
  if (start >= 0) {
    const r = route(start);
    ps.forEach((p, i) => {
      if (!p.checkpoint) return;
      if (r.cost[i] === Infinity) problems.push(`Checkpoint on platform ${i} can't be reached from the start`);
      else note(r, i);
    });
    if (goal >= 0) {
      if (r.cost[goal] === Infinity) problems.push(`The goal (platform ${goal}) can't be reached from the start`);
      else note(r, goal);
    }
  }
  if (goal >= 0) {
    ps.forEach((p, i) => {
      if (!p.checkpoint) return;
      const r = route(i);
      if (r.cost[goal] === Infinity) problems.push(`The goal can't be reached from the checkpoint on platform ${i}`);
      else note(r, goal);
    });
  }
  return { ok: problems.length === 0, problems, hardest };
}

/** What a kinematic collider offers (core/physics.ts `kinematicBox`). */
interface Mover { readonly pos: THREE.Vector3; moveTo(x: number, y: number, z: number): void; remove(): void }

/** Course color when a platform names none. */
const DEFAULT_LOOK = 0x8a8478;

/**
 * Builds a course. `origin` is the world position its x/z/top coordinates are relative to. Static platforms are merged meshes with world
 * colliders; movers are dynamic meshes with kinematic colliders (Prop layer, so the camera
 * passes through). `update(t)` slides every mover to its position at `t` seconds.
 */
export function buildCourse(b: AreaBuilder, course: Pick<CourseDef, 'platforms'>, origin: { x: number; y: number; z: number }, look = DEFAULT_LOOK) {
  const movers: { def: PlatformDef; mesh: THREE.Mesh; body: Mover; base: THREE.Vector3 }[] = [];
  for (const p of course.platforms) {
    const th = p.thickness ?? 1;
    const cx = origin.x + p.x, cy = origin.y + p.top - th / 2, cz = origin.z + p.z;
    const geo = new THREE.BoxGeometry(p.w, th, p.d);
    const material = mat(p.look ?? look);
    if (!p.move) {
      b.mesh(geo, material, cx, cy, cz);
      b.box(cx, cy, cz, p.w / 2, th / 2, p.d / 2);
      continue;
    }
    const mesh = b.dynamic(new THREE.Mesh(geo, material));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(cx, cy, cz);
    const body: Mover = b.physics.kinematicBox(cx, cy, cz, p.w / 2, th / 2, p.d / 2, Layer.Prop);
    movers.push({ def: p, mesh, body, base: new THREE.Vector3(cx, cy, cz) });
  }
  return {
    update(t: number) {
      for (const m of movers) {
        const [dx, dy, dz] = platformPosition(m.def, t);
        m.mesh.position.set(m.base.x + dx, m.base.y + dy, m.base.z + dz);
        m.body.moveTo(m.base.x + dx, m.base.y + dy, m.base.z + dz);
      }
    },
    /** Takes the movers' colliders out of the physics world (the meshes go with the area). */
    dispose() {
      for (const m of movers) m.body.remove();
      movers.length = 0;
    },
  };
}
