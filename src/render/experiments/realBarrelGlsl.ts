/**
 * EXPERIMENT (owner's request, 2026-11-09): the shaders for the photoreal barrel (`realBarrel.ts`). Not the game's art style.
 * Everything is procedural and evaluated per pixel in real units (metres), so the detail never runs out of texels:
 * oak growth rings, earlywood pores, medullary ray flecks, drawknife ripples, checks, dents, iron-tannin stains, rust
 * drips, a wine stain, chalk, dust, a cooper's brand; forged hoops with mill scale, rust, pitting and hammer dents.
 * Relief becomes normals by bump mapping (height sampled at the neighbouring pixels' positions).
 */

const NOISE = /* glsl */ `
uvec3 bPcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 bGrad(ivec3 c) {
  uvec3 h = bPcg(uvec3(c + 65536));
  return vec3(h & 0xffffu) / 32767.5 - 1.0;
}
float bHash(float x) { return float(bPcg(uvec3(floatBitsToUint(x), 7u, 13u)).x & 0xffffffu) / 16777215.0; }
vec3 bHash3(vec3 x) { uvec3 h = bPcg(floatBitsToUint(x)); return vec3(h & 0xffffffu) / 16777215.0; }
float gnoise(vec3 p) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 f = p - fl;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(bGrad(i), f);
  float b = dot(bGrad(i + ivec3(1, 0, 0)), f - vec3(1, 0, 0));
  float c = dot(bGrad(i + ivec3(0, 1, 0)), f - vec3(0, 1, 0));
  float d = dot(bGrad(i + ivec3(1, 1, 0)), f - vec3(1, 1, 0));
  float e = dot(bGrad(i + ivec3(0, 0, 1)), f - vec3(0, 0, 1));
  float g = dot(bGrad(i + ivec3(1, 0, 1)), f - vec3(1, 0, 1));
  float h = dot(bGrad(i + ivec3(0, 1, 1)), f - vec3(0, 1, 1));
  float k = dot(bGrad(i + ivec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z) * 1.15;
}
float fbm3(vec3 p) { return gnoise(p) * 0.57 + gnoise(p * 2.03 + 17.1) * 0.29 + gnoise(p * 4.11 + 3.7) * 0.14; }
// Fades a feature out as its frequency (cycles per metre) nears the pixel size: no shimmer far off.
float bAA(float freq, float fw) { return 1.0 - smoothstep(0.25, 0.75, freq * fw); }
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
// Bump mapping from three heights (here, one pixel right, one pixel up), in metres: Mikkelsen's surface gradient.
vec3 bumpNormal(vec3 pos, vec3 n, vec3 h, float faceDir) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * ((h.y - h.x) * r1 + (h.z - h.x) * r2);
  return normalize(abs(det) * n - grad);
}
`;

/** Wood: staves (kind 0, quarter-sawn), head boards (kind 1, flat-sawn), the bung (kind 2). */
export const WOOD_HEADER = /* glsl */ `
${NOISE}
uniform float uT;
uniform vec4 uHoops[6];
uniform vec4 uBung;   // angle, y, radius, belly radius
uniform vec2 uHead;   // top of the head (y), its radius
varying vec3 vWood;   // board coords, metres: across, along the grain, depth below the face
varying vec4 vInfo;   // seed, kind, board width, end grain
varying vec3 vObj;

float ringWidth(float seed) { return mix(0.0018, 0.0046, bHash(seed * 3.3)); }

float woodRings(vec3 p, float seed, float kind, out float rid) {
  float s1 = bHash(seed * 7.1), s2 = bHash(seed * 13.7), s3 = bHash(seed * 29.3);
  vec2 pith; float tilt;
  if (kind < 0.5) { pith = vec2(-0.05 - 0.2 * s1, (s2 - 0.5) * 0.06); tilt = (s3 - 0.5) * 0.03; }
  else { pith = vec2(0.015 + 0.05 * s1, 0.07 + 0.16 * s2); tilt = (s3 - 0.5) * 0.14; }
  float wander = 0.0016 * gnoise(vec3(p.y * 5.0, seed, 1.0)) + 0.0005 * gnoise(vec3(p.y * 31.0, seed, 2.0));
  vec2 q = vec2(p.x - pith.x - tilt * p.y + wander, p.z - pith.y);
  float r = length(q);
  r += 0.0035 * fbm3(vec3(p.x * 9.0, p.y * 1.3, p.z * 9.0) + seed * 17.0) + 0.0005 * gnoise(vec3(p.y * 14.0, r * 40.0, seed));
  float ph = r / ringWidth(seed);
  ph += 0.6 * gnoise(vec3(r * 35.0, seed * 3.0, 0.5)) + 0.25 * gnoise(vec3(r * 120.0, p.y * 2.0, seed));
  rid = floor(ph);
  return fract(ph);
}
float earlyMask(float f) { return smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.14, 0.5, f)); }
// Some rings are bold, some barely there.
float ringStrength(float rid, float seed) { return 0.3 + 0.7 * bHash(rid * 1.37 + seed); }

float crackAt(vec3 p, float seed, float fw) {
  float cell = 0.018;
  float cx = floor(p.x / cell);
  vec3 r = bHash3(vec3(cx, seed, 3.7));
  if (r.x > 0.45) return 0.0;
  float x0 = (cx + 0.2 + 0.6 * r.y) * cell + 0.0012 * gnoise(vec3(p.y * 22.0, cx, seed));
  float d = abs(p.x - x0);
  float gate = smoothstep(0.25, 0.55, gnoise(vec3(cx * 7.3, p.y * 5.0 + r.z * 10.0, seed * 2.0)));
  float wd = 0.00015 + 0.0003 * gate;
  float soft = max(fw * 0.7, 0.00006);
  return gate * (1.0 - smoothstep(wd - soft, wd + soft, d)) * min(1.0, wd / soft);
}

float dentAt(vec3 p, float seed) {
  vec2 q = p.xy / 0.035;
  vec2 c = floor(q);
  float best = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = c + vec2(i, j);
    vec3 r = bHash3(vec3(cc, seed + 9.1));
    if (r.z > 0.2) continue;
    vec2 ctr = (cc + r.xy) * 0.035;
    float rad = 0.002 + 0.005 * fract(r.z * 37.0);
    float d = length((p.xy - ctr) * vec2(1.0, 0.6));
    best = max(best, pow(max(0.0, 1.0 - d / rad), 2.0));
  }
  return best;
}

float woodHeight(vec3 p, float seed, float kind, float endg, float fw) {
  float rid;
  float f = woodRings(p, seed, kind, rid);
  float e = earlyMask(f) * ringStrength(rid, seed);
  float exposed = (kind > 0.5 && kind < 1.5) ? 1.7 : 1.0;
  float h = (0.5 - e) * 0.00016 * bAA(1.0 / ringWidth(seed), fw) * exposed;  // weathered: latewood stands proud
  float pore = smoothstep(0.35, 0.75, gnoise(vec3(p.x * 1800.0, p.y * 480.0, p.z * 1800.0) + seed * 31.0));
  h -= pore * e * 0.00009 * bAA(1800.0, fw);
  if (endg < 0.5) {
    float rip = sin(p.y * 251.3 + 2.5 * gnoise(vec3(p.x * 18.0, p.y * 2.0, seed * 5.0)));
    float inner = smoothstep(uT * 0.5, uT * 0.8, p.z);
    h += rip * (0.00006 + 0.0002 * inner) * (0.6 + 0.4 * gnoise(vec3(p.y * 3.0, p.x * 25.0, seed))) * bAA(40.0, fw);
    h -= crackAt(p, seed, fw) * 0.0007;
    h -= dentAt(p, seed) * 0.0005;
  } else {
    h += gnoise(p * 900.0) * 0.0001 * bAA(900.0, fw);
  }
  return h;
}

void barrelWood(out vec3 col, out float rough, out vec3 hs) {
  vec3 p = vWood;
  float seed = vInfo.x, kind = vInfo.y, w = vInfo.z, endg = step(0.5, vInfo.w);
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float fw = max(length(dpx) + length(dpy), 1e-6) * 0.5;
  hs = vec3(woodHeight(p, seed, kind, endg, fw), woodHeight(p + dpx, seed, kind, endg, fw), woodHeight(p + dpy, seed, kind, endg, fw));

  // The wood itself.
  float rid;
  float f = woodRings(p, seed, kind, rid);
  float e = earlyMask(f) * ringStrength(rid, seed);
  float ringAA = bAA(1.0 / ringWidth(seed), fw);
  float eA = mix(0.3, e, ringAA);
  col = mix(srgb(vec3(0.52, 0.375, 0.24)), srgb(vec3(0.33, 0.215, 0.13)), eA);
  col *= mix(1.0, 0.9 + 0.2 * bHash(rid + seed * 101.0), ringAA);
  float paa = bAA(1800.0, fw);
  float pore = smoothstep(0.35, 0.75, gnoise(vec3(p.x * 1800.0, p.y * 480.0, p.z * 1800.0) + seed * 31.0));
  col = mix(col, srgb(vec3(0.2, 0.12, 0.07)), pore * e * 0.55 * paa + e * 0.1 * (1.0 - paa));
  float fleck = 0.0;
  if (kind < 0.5 && endg < 0.5) {
    float fa = bAA(450.0, fw);
    float dens = smoothstep(-0.3, 0.5, gnoise(vec3(p.x * 40.0, p.y * 5.0, seed * 3.0)));
    fleck = smoothstep(0.42, 0.62, gnoise(vec3(p.x * 450.0, p.y * 65.0, p.z * 450.0) + seed * 13.0)) * dens;
    col = mix(col, srgb(vec3(0.68, 0.53, 0.36)), fleck * 0.55 * fa + 0.08 * dens * (1.0 - fa));
    fleck *= fa;
  }
  // mineral streaks and colour runs along the grain
  col *= 0.78 + 0.44 * (0.5 + 0.5 * fbm3(vec3(p.x * 55.0, p.y * 1.4, seed * 9.0)));
  vec3 sh = bHash3(vec3(seed, 1.3, 2.9));
  col *= mix(vec3(1.0, 0.86, 0.74), vec3(0.95, 0.97, 1.0), sh.x) * (0.62 + 0.5 * sh.y);
  rough = mix(0.70, 0.86, eA) + pore * e * 0.08 * paa - fleck * 0.22;

  float cr = endg < 0.5 ? crackAt(p, seed, fw) : 0.0;
  float dn = endg < 0.5 ? dentAt(p, seed) : 0.0;
  col *= (1.0 - 0.7 * cr) * (1.0 - 0.25 * dn);
  if (endg > 0.5) { col *= 0.6; rough = 0.93; }

  // The stave's inside: toasted, charred in patches.
  float inner = kind < 0.5 ? smoothstep(uT * 0.5, uT * 0.8, p.z) * (1.0 - endg) : 0.0;
  vec3 toast = mix(srgb(vec3(0.30, 0.17, 0.09)), srgb(vec3(0.07, 0.045, 0.035)), smoothstep(-0.2, 0.5, fbm3(p * vec3(60.0, 8.0, 60.0) + seed)));
  col = mix(col, toast * (0.8 + 0.4 * (1.0 - eA)), inner);
  rough = mix(rough, 0.9, inner);

  // Where it sits in the barrel: weathering, iron, wine, chalk, dust.
  vec3 o = vObj;
  float ang = atan(o.z, o.x);
  float arc = ang * uBung.w;
  float outer = kind < 0.5 ? (1.0 - smoothstep(0.002, 0.005, p.z)) * (1.0 - endg) : 0.0;
  float isHead = (kind > 0.5 && kind < 1.5) ? 1.0 - endg : 0.0;
  col *= 0.88 + 0.12 * fbm3(o * 4.0 + 5.0) * 2.0;
  col *= 0.82 + 0.36 * (0.5 + 0.5 * fbm3(vec3(p.x * 20.0, p.y * 4.0, seed * 2.0)));
  col *= 1.0 - 0.28 * outer * smoothstep(0.1, 0.7, gnoise(vec3(arc * 55.0, o.y * 1.6, 3.0))) * smoothstep(0.1, 0.5, o.y);
  float grey = clamp(0.35 + 0.55 * fbm3(o * 7.0 + 11.0), 0.0, 1.0) * (outer * 0.7 + isHead * 0.8);
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(L) * vec3(1.04, 1.0, 0.94) * 1.35, grey * 0.6);

  float ed = min(p.x, w - p.x);
  float eg = (1.0 - smoothstep(0.0004, 0.005, ed)) * (1.0 - endg) * (1.0 - inner);
  col *= 1.0 - 0.45 * eg;
  rough += 0.06 * eg;

  if (outer > 0.0) {
    float stain = 0.0, rust = 0.0, ao = 1.0;
    for (int i = 0; i < 6; i++) {
      float y0 = uHoops[i].x, y1 = uHoops[i].y;
      float dBelow = y0 - o.y, dAbove = o.y - y1;
      float d = max(max(dBelow, dAbove), 0.0);
      float n = gnoise(vec3(arc * 35.0, o.y * 30.0, float(i) * 7.0));
      stain = max(stain, exp(-d / (0.008 + 0.014 * (0.5 + 0.5 * n))) * (0.7 + 0.3 * n));
      ao = min(ao, mix(0.5, 1.0, smoothstep(0.0, 0.007, d)));
      if (dBelow > 0.0) {
        float sn = gnoise(vec3(arc * 140.0, dBelow * 4.0 - float(i), float(i) * 3.1));
        float len = 0.03 + 0.09 * (0.5 + 0.5 * gnoise(vec3(arc * 25.0, float(i), 1.0)));
        rust = max(rust, smoothstep(0.15, 0.6, sn) * exp(-dBelow / len) * smoothstep(0.0, 0.004, dBelow));
      }
    }
    col = mix(col, srgb(vec3(0.12, 0.115, 0.125)) * (0.7 + 0.6 * L), stain * 0.85 * outer);
    col = mix(col, srgb(vec3(0.42, 0.20, 0.09)), rust * 0.6 * outer);
    col *= mix(1.0, ao, outer);
    rough = mix(rough, 0.8, stain * 0.5 * outer);
  }

  // The bung's wine: a soaked ring and drips running down.
  {
    float da = ang - uBung.x; da = atan(sin(da), cos(da));
    vec2 q = vec2(da * uBung.w, o.y - uBung.y);
    float r = length(q);
    float rim = exp(-max(r - uBung.z, 0.0) / 0.028) * (0.6 + 0.4 * gnoise(vec3(q * 80.0, 2.0)));
    float drip = 0.0;
    if (q.y < 0.0) {
      float sn = gnoise(vec3(q.x * 90.0, q.y * 3.0, 4.0));
      drip = smoothstep(0.1, 0.6, sn) * exp(q.y / 0.12) * (1.0 - smoothstep(0.012, 0.05, abs(q.x)));
    }
    float wine = clamp(rim + drip, 0.0, 1.0) * outer;
    float hole = (1.0 - smoothstep(0.0, 0.003, abs(r - uBung.z - 0.0005))) * outer;
    col = mix(col, srgb(vec3(0.24, 0.05, 0.08)) * (0.6 + 0.6 * L), wine * 0.8);
    col *= 1.0 - 0.7 * hole;
    rough = mix(rough, 0.55, wine * 0.6);
    if (kind > 1.5) { col *= vec3(0.75, 0.52, 0.55); rough = mix(rough, 0.6, 0.5); }
  }

  // Dried mud splashed up from the ground; damp darkening low down.
  if (kind < 0.5) {
    float dirt = 1.0 - smoothstep(0.0, 0.09 + 0.05 * fbm3(o * 12.0), o.y);
    dirt *= 0.6 + 0.4 * smoothstep(-0.4, 0.4, gnoise(o * 70.0));
    col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.3, o.y));
    col = mix(col, srgb(vec3(0.30, 0.26, 0.20)), dirt * 0.75 * outer);
    rough = mix(rough, 0.97, dirt * outer);
    if (inner > 0.0) col *= mix(0.25, 1.0, smoothstep(0.0, 0.035, o.y - uHead.x));
  }

  // A cellarman's chalk tally, opposite the bung; chalk only catches the raised grain.
  if (outer > 0.0) {
    float da = ang - (uBung.x + 3.14159); da = atan(sin(da), cos(da));
    vec2 q = vec2(da * uBung.w, o.y - 0.50);
    float lw = 0.0019, s = 0.0008 + fw;
    float chalk = 0.0;
    for (int i = 0; i < 4; i++) {
      float x = -0.026 + float(i) * 0.017 + 0.002 * sin(float(i) * 3.1);
      float dx = abs(q.x - x - q.y * 0.06 * sin(float(i) * 1.7));
      float inY = 1.0 - smoothstep(0.027, 0.033, abs(q.y - 0.002 * float(i)));
      chalk = max(chalk, (1.0 - smoothstep(lw - s, lw + s, dx)) * inY);
    }
    vec2 a = vec2(-0.04, -0.022), b = vec2(0.042, 0.026);
    float t = clamp(dot(q - a, b - a) / dot(b - a, b - a), 0.0, 1.0);
    chalk = max(chalk, 1.0 - smoothstep(lw - s, lw + s, length(q - a - t * (b - a))));
    float grit = smoothstep(-0.2, 0.5, gnoise(vec3(q * 600.0, 1.0)));
    chalk *= (0.35 + 0.65 * (1.0 - eA)) * mix(0.5, 1.0, grit) * outer;
    col = mix(col, srgb(vec3(0.86, 0.85, 0.80)), chalk * 0.85);
    rough = mix(rough, 1.0, chalk);
  }

  // The head: a burnt brand, dust that gathers toward the rim, one swipe of a hand through it.
  if (isHead > 0.0) {
    float rimD = uHead.y - length(o.xz);
    vec2 b = o.xz - vec2(0.03, -0.05);
    float br = length(b);
    float bw = 0.0012 + fw;
    float ring1 = 1.0 - smoothstep(0.0025 - bw, 0.0025 + bw, abs(br - 0.075));
    float ring2 = 1.0 - smoothstep(0.0012 - bw, 0.0012 + bw, abs(br - 0.062));
    vec2 fq = b / 0.03;
    float c1 = length(fq - vec2(0.0, -0.3)) - 0.45;
    float c2 = (length(vec2(fq.x / 0.28, (fq.y - 0.2) / 0.75)) - 1.0) * 0.28;
    float hh = clamp(0.5 + 0.5 * (c2 - c1) / 0.25, 0.0, 1.0);
    float fl = mix(c2, c1, hh) - 0.25 * hh * (1.0 - hh);
    float flame = 1.0 - smoothstep(-0.03, 0.05, fl);
    float brand = max(max(ring1, ring2), flame) * (0.65 + 0.35 * gnoise(vec3(b * 300.0, 5.0)));
    col = mix(col, srgb(vec3(0.09, 0.055, 0.035)), brand * 0.85);
    rough = mix(rough, 0.92, brand);

    float dust = clamp(0.1 + 0.6 * fbm3(vec3(o.xz * 7.0, 3.0)) + 0.6 * (1.0 - smoothstep(0.0, 0.06, rimD)), 0.0, 1.0);
    dust *= 0.5 + 0.5 * smoothstep(-0.3, 0.3, gnoise(vec3(o.xz * 60.0, 4.0)));
    dust *= mix(0.65, 1.25, eA);
    float sw = abs(o.z + 0.05 - 1.6 * o.x * o.x + 0.012 * gnoise(vec3(o.x * 30.0, 1.0, 1.0)));
    float wiped = (1.0 - smoothstep(0.03, 0.05, sw)) * smoothstep(-0.24, -0.16, o.x) * (1.0 - smoothstep(0.15, 0.24, o.x));
    wiped *= 0.7 + 0.3 * gnoise(vec3(o.x * 8.0, sw * 500.0, 2.0));
    dust *= 1.0 - clamp(wiped, 0.0, 1.0) * 0.9;
    dust *= 0.75 + 0.25 * gnoise(vec3(o.xz * 400.0, 9.0)) * bAA(400.0, fw);
    col = mix(col, srgb(vec3(0.60, 0.56, 0.50)), dust * 0.75);
    rough = mix(rough, 0.97, dust * 0.8);
    col *= mix(0.4, 1.0, smoothstep(0.0, 0.03, rimD));
  }
  rough = clamp(rough, 0.35, 1.0);
}
`;

/** Iron: the hoops, their overlaps and rivets. vHoop = around (m), across (m), seed, band width. */
export const IRON_HEADER = /* glsl */ `
${NOISE}
uniform float uH;
varying vec4 vHoop;
varying vec3 vObj;

float hoopRust(vec2 q, float w, float seed) {
  float low = 1.0 - clamp(vObj.y / uH, 0.0, 1.0);
  float edgeB = 1.0 - smoothstep(0.0, 0.012, q.y);
  float n = fbm3(vec3(q.x * 22.0, q.y * 22.0, seed * 5.0));
  return smoothstep(0.05, 0.35, n * 0.9 + 0.35 * low + 0.3 * edgeB - 0.12 + 0.15 * gnoise(vec3(q * 180.0, seed)) + 0.07 * gnoise(vec3(q * 700.0, seed + 2.0)));
}
float hammerDent(vec2 q, float w, float seed) {
  float cell = 0.026;
  float ci = floor(q.x / cell);
  vec3 r = bHash3(vec3(ci, seed, 1.0));
  vec2 c = vec2((ci + 0.25 + 0.5 * r.x) * cell, w - 0.003 - 0.004 * r.y);
  return pow(max(0.0, 1.0 - length(q - c) / (0.003 + 0.003 * r.z)), 2.0) * step(r.z, 0.35);
}
float hoopHeight(vec2 q, float w, float seed, float fw) {
  float rm = hoopRust(q, w, seed);
  float h = rm * 0.00012 * (0.6 + 0.4 * gnoise(vec3(q * 600.0, seed))) * bAA(600.0, fw);
  h -= 0.00006 * smoothstep(0.5, 0.85, gnoise(vec3(q * 1100.0, seed + 3.0))) * bAA(1100.0, fw);
  h -= hammerDent(q, w, seed) * 0.00035;
  h += 0.00005 * gnoise(vec3(q * 120.0, seed + 7.0));
  return h;
}
void barrelIron(out vec3 col, out float rough, out float metal, out vec3 hs) {
  vec2 q = vHoop.xy;
  float seed = vHoop.z, w = vHoop.w;
  vec2 dqx = dFdx(q), dqy = dFdy(q);
  float fw = max(length(dqx) + length(dqy), 1e-6) * 0.5;
  hs = vec3(hoopHeight(q, w, seed, fw), hoopHeight(q + dqx, w, seed, fw), hoopHeight(q + dqy, w, seed, fw));
  float rm = hoopRust(q, w, seed);
  float dent = hammerDent(q, w, seed);
  vec3 scale = srgb(vec3(0.25, 0.25, 0.26)) * (0.8 + 0.2 * gnoise(vec3(q * 40.0, seed)) * 2.0);
  float patina = smoothstep(-0.3, 0.4, fbm3(vec3(q * 45.0, seed + 8.0)));
  scale = mix(scale, srgb(vec3(0.22, 0.17, 0.13)), patina * 0.7);
  vec3 bare = srgb(vec3(0.56, 0.56, 0.57));
  float edge = (1.0 - smoothstep(0.0005, 0.0035, min(q.y, w - q.y))) * 0.7;
  float worn = clamp(edge * smoothstep(-0.1, 0.4, gnoise(vec3(q.x * 50.0, seed, 2.0))) + dent * 0.2, 0.0, 1.0) * (1.0 - rm);
  col = mix(scale, bare, worn);
  metal = mix(0.45 - 0.25 * patina, 1.0, worn);
  rough = mix(0.62 + 0.15 * gnoise(vec3(q * 70.0, seed + 1.0)) + 0.12 * patina, 0.4, worn);
  vec3 rust = mix(srgb(vec3(0.47, 0.22, 0.09)), srgb(vec3(0.26, 0.12, 0.06)), 0.5 + 0.5 * gnoise(vec3(q * 260.0, seed + 5.0)));
  rust *= 0.85 + 0.3 * (0.5 + 0.5 * gnoise(vec3(q * 90.0, seed + 6.0)));
  col = mix(col, rust, rm);
  metal = mix(metal, 0.0, rm);
  rough = mix(rough, 0.9, rm);
}
`;
