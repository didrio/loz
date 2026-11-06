// Small math helpers shared across the game: noise, easing, angles, seeded randomness.

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite smoothstep; works with a > b too (falls instead of rises). */
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise in [0, 1]. */
export function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Four octaves of value noise, normalized to [0, 1]. */
export function fbm(x: number, z: number) {
  let s = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < 4; i++) {
    s += amp * vnoise(x * f, z * f);
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
}

/** Deterministic RNG so the world is laid out the same on every load. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest signed difference between two angles. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;

/** Frame-rate independent smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A centerline through points: how far along it you are, and the point, direction and normal at a distance. */
export function centerline(path: [number, number][]) {
  const segs = path.slice(1).map((p, i) => {
    const [ax, az] = path[i];
    return { ax, az, bx: p[0], bz: p[1], len: Math.hypot(p[0] - ax, p[1] - az) };
  });
  const offsets = segs.reduce<number[]>((o, g) => [...o, o[o.length - 1] + g.len], [0]);
  const length = offsets[segs.length];
  return {
    length,
    segs,
    /** The point `s` meters along, its unit direction (inward) and its left-hand normal. */
    point(s: number) {
      const c = Math.max(0, Math.min(length, s));
      let i = segs.findIndex((_, k) => c <= offsets[k + 1]);
      if (i < 0) i = segs.length - 1;
      const g = segs[i];
      const t = (c - offsets[i]) / g.len;
      const dx = (g.bx - g.ax) / g.len, dz = (g.bz - g.az) / g.len;
      return { x: g.ax + (g.bx - g.ax) * t, z: g.az + (g.bz - g.az) * t, dx, dz, nx: dz, nz: -dx };
    },
    /** Distance `d` from the centerline and how far along it (`s`) the nearest point is. */
    frame(x: number, z: number) {
      let d = Infinity, s = 0;
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const dx = g.bx - g.ax, dz = g.bz - g.az;
        const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
        const di = Math.hypot(x - (g.ax + dx * t), z - (g.az + dz * t));
        if (di < d) { d = di; s = offsets[i] + t * g.len; }
      }
      return { d, s };
    },
  };
}
