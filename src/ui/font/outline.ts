// Turns a glyph's skeleton (the pen's path, ui/font/glyphs.ts) into filled TrueType contours: a round
// pen of one width traced along every stroke. Like a brush in a drawing app: the same skeleton at a
// wider pen gives the bold face.
//
// The skeleton language, in design units (x-height 5, cap height 7, baseline 0), tokens split by spaces:
//   x,y                    a point; consecutive points are joined by straight strokes
//   a cx,cy,rx,ry,a0,a1    an elliptical arc from angle a0 to a1 in degrees (counter-clockwise is positive),
//                          written `a2.5,2.5,2.5,2.5,0,180`; joined to the previous point if it starts elsewhere
//   o cx,cy,rx,ry          a closed ellipse (its own stroke), written `o2.5,2.5,2.5,2.5`
//   z                      closes the current stroke back to its first point (smooth loops only)
//   f                      fills the current stroke's polygon too (solid triangles)
//   |                      starts a new stroke
// A stroke of one point is a dot (a slightly bigger round blob).

import type { Contour, TtPoint } from './ttf';

type P = [number, number];

export interface Stroke {
  pts: P[];
  closed: boolean;
  filled: boolean;
}

/** Corners sharper than this (degrees of turn) get a round join; gentler ones a mitred one. */
const SPLIT_TURN = 50;
/** Arcs are flattened to segments of at most this many degrees. */
const ARC_STEP = 10;
/** A dot's radius, relative to the pen's. */
const DOT = 1.25;

const near = (a: P, b: P) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): P[] {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / ARC_STEP));
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** Parses a skeleton string into strokes. Throws on a bad token (the glyph table is checked by a test). */
export function parseSkeleton(src: string): Stroke[] {
  const strokes: Stroke[] = [];
  let cur: Stroke | null = null;
  const start = (): Stroke => (cur = { pts: [], closed: false, filled: false } as Stroke);
  const push = (pts: P[]) => {
    const s = cur ?? start();
    for (const p of pts) if (!s.pts.length || !near(s.pts[s.pts.length - 1], p)) s.pts.push(p);
  };
  const end = () => {
    if (cur?.pts.length) strokes.push(cur);
    cur = null;
  };
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') end();
    else if (tok === 'z') (cur ?? start()).closed = true;
    else if (tok === 'f') (cur ?? start()).filled = true;
    else if (tok[0] === 'a' || tok[0] === 'o') {
      const n = tok.slice(1).split(',').map(Number);
      if (n.some(Number.isNaN) || n.length !== (tok[0] === 'a' ? 6 : 4)) throw new Error(`bad arc "${tok}"`);
      if (tok[0] === 'o') {
        end();
        push(arcPoints(n[0], n[1], n[2], n[3], 0, 360).slice(0, -1));
        cur!.closed = true;
        end();
      } else push(arcPoints(n[0], n[1], n[2], n[3], n[4], n[5]));
    } else {
      const n = tok.split(',').map(Number);
      if (n.length !== 2 || n.some(Number.isNaN)) throw new Error(`bad point "${tok}"`);
      push([[n[0], n[1]]]);
    }
  }
  end();
  for (const s of strokes) if (s.closed && s.pts.length > 1 && near(s.pts[0], s.pts[s.pts.length - 1])) s.pts.pop();
  return strokes;
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (v: P) => Math.hypot(v[0], v[1]);
const unit = (v: P): P => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};
/** The left-hand normal of a direction (y up). */
const left = (d: P): P => [-d[1], d[0]];
const turnDeg = (d0: P, d1: P) => (Math.acos(Math.max(-1, Math.min(1, d0[0] * d1[0] + d0[1] * d1[1]))) * 180) / Math.PI;

/** The signed area of a polygon (shoelace); negative = clockwise with y up. */
export function signedArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const on = (p: P): TtPoint => ({ x: p[0], y: p[1], on: true });
const off = (p: P): TtPoint => ({ x: p[0], y: p[1], on: false });

/**
 * Points of a clockwise circular arc around `c` from angle `from` (radians) by `sweep` (negative =
 * clockwise), as quadratic pieces of at most 45°: off-curve, on-curve, ... ending on the end point.
 * The start point itself isn't included (the caller already has it).
 */
function roundArc(c: P, r: number, from: number, sweep: number): TtPoint[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 4) - 1e-9));
  const step = sweep / n;
  const k = r / Math.cos(step / 2);
  const out: TtPoint[] = [];
  for (let i = 0; i < n; i++) {
    const mid = from + step * (i + 0.5);
    const endA = from + step * (i + 1);
    out.push(off([c[0] + k * Math.cos(mid), c[1] + k * Math.sin(mid)]));
    out.push(on([c[0] + r * Math.cos(endA), c[1] + r * Math.sin(endA)]));
  }
  return out;
}

/** A full circle, clockwise. */
export function circle(c: P, r: number): Contour {
  const pts = roundArc(c, r, 0, -2 * Math.PI);
  // roundArc ends on the start point: rotate so the contour starts there and doesn't repeat it.
  return [pts[pts.length - 1], ...pts.slice(0, -1)];
}

/** Offsets a run of points by `h` to the left of travel, mitring the joins (the run has no sharp corners). */
function offsetRun(pts: P[], h: number, closed: boolean): P[] {
  const n = pts.length;
  const dirs: P[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) dirs.push(unit(sub(pts[(i + 1) % n], pts[i])));
  return pts.map((p, i) => {
    const dIn = closed ? dirs[(i - 1 + n) % n] : dirs[Math.max(0, i - 1)];
    const dOut = closed ? dirs[i] : dirs[Math.min(dirs.length - 1, i)];
    const nIn = left(dIn);
    const nOut = left(dOut);
    const m = unit([nIn[0] + nOut[0], nIn[1] + nOut[1]]);
    const cos = Math.max(0.3, m[0] * nOut[0] + m[1] * nOut[1]);
    return [p[0] + (m[0] * h) / cos, p[1] + (m[1] * h) / cos];
  });
}

/** An open run with round caps at both ends, as one clockwise contour. */
function capsule(pts: P[], h: number): Contour {
  if (pts.length === 1) return circle(pts[0], h * DOT);
  const L = offsetRun(pts, h, false); // left side, travelling forward
  const R = offsetRun(pts, -h, false); // right side
  const dEnd = unit(sub(pts[pts.length - 1], pts[pts.length - 2]));
  const dStart = unit(sub(pts[1], pts[0]));
  const angEnd = Math.atan2(left(dEnd)[1], left(dEnd)[0]);
  const angStart = Math.atan2(-left(dStart)[1], -left(dStart)[0]);
  // Left side forward, round the end clockwise (left → right), right side backward, round the start.
  const out: Contour = L.map(on);
  out.push(...roundArc(pts[pts.length - 1], h, angEnd, -Math.PI).slice(0, -1));
  out.push(...[...R].reverse().map(on));
  out.push(...roundArc(pts[0], h, angStart, -Math.PI).slice(0, -1));
  return out;
}

/** Splits an open stroke at its sharp corners, so each piece gets round caps (which make round joins). */
function splitAtCorners(pts: P[]): P[][] {
  const runs: P[][] = [];
  let run: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    if (i < pts.length - 1 && turnDeg(unit(sub(pts[i], pts[i - 1])), unit(sub(pts[i + 1], pts[i]))) > SPLIT_TURN) {
      runs.push(run);
      run = [pts[i]];
    }
  }
  runs.push(run);
  return runs;
}

const orient = (c: P[], clockwise: boolean) => {
  const cw = signedArea(c.map(([x, y]) => ({ x, y }))) < 0;
  return cw === clockwise ? c : [...c].reverse();
};

/** Outlines strokes with a round pen of half-width `h`. Every contour is clockwise except a loop's hole. */
export function outlineStrokes(strokes: Stroke[], h: number): Contour[] {
  const out: Contour[] = [];
  for (const s of strokes) {
    if (s.filled && s.pts.length > 2) {
      out.push(orient(s.pts, true).map(on));
      const ring = [...s.pts, s.pts[0]];
      for (let i = 0; i < ring.length - 1; i++) out.push(capsule([ring[i], ring[i + 1]], h));
    } else if (s.closed && s.pts.length > 2) {
      const a = offsetRun(s.pts, h, true);
      const b = offsetRun(s.pts, -h, true);
      const area = (c: P[]) => Math.abs(signedArea(c.map(([x, y]) => ({ x, y }))));
      const [outer, inner] = area(a) > area(b) ? [a, b] : [b, a];
      out.push(orient(outer, true).map(on), orient(inner, false).map(on));
    } else for (const run of splitAtCorners(s.pts)) out.push(capsule(run, h));
  }
  return out;
}
