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
