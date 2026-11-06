// Look scenes' baselines and render budgets (used by look.mjs; pure apart from the file helpers).
//
// A baseline is the approved screenshot of one shot, stored shrunk 4x (box average) in
// scripts/baselines/look/<shot>.png: small enough to keep in git, big enough to see a moved sign.
// A budget is the most draw calls and triangles a scene may use, in scripts/look-budgets.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const BASELINES = new URL('./baselines/look/', import.meta.url).pathname;
export const BUDGET_FILE = new URL('./look-budgets.json', import.meta.url).pathname;

/** Baselines keep every SHRINK-th pixel's worth of detail per side: the repo holds ~150 of them. */
export const SHRINK = 4;
/** A shot counts as changed when more than this share of its (half-size) pixels differ. */
export const CHANGED_SHARE = 0.0005; // ~29 of a 320x180 baseline's pixels: a few dots of render noise are not a change
/** pixelmatch's per-pixel colour tolerance (0 strict .. 1 anything). */
const PIXEL_THRESHOLD = 0.1;
/** A budget is the scene's measured peak plus this much headroom. */
export const HEADROOM = 1.25;

/** Shrinks a PNG by `k` (default SHRINK) by averaging each k x k block. Odd edges drop their last row/column. */
export function shrink(png, k = SHRINK) {
  const w = Math.floor(png.width / k), h = Math.floor(png.height / k);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) sum += png.data[((k * y + dy) * png.width + k * x + dx) * 4 + c];
        out.data[o + c] = Math.round(sum / (k * k));
      }
    }
  }
  return out;
}

/** Compares two same-size PNGs: { changed, share, pixels, diff } (diff is a PNG of the differences). */
export function compare(baseline, current) {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return { changed: true, share: 1, pixels: baseline.width * baseline.height, diff: null, resized: true };
  }
  const diff = new PNG({ width: current.width, height: current.height });
  const pixels = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, { threshold: PIXEL_THRESHOLD });
  const share = pixels / (current.width * current.height);
  return { changed: share > CHANGED_SHARE, share, pixels, diff };
}

/** Over-budget scenes: [{ scene, what, value, limit }]. A scene with no entry in `budgets` has no limit yet. */
export function overBudget(budgets, scene, peak) {
  const limit = budgets[scene];
  if (!limit) return [];
  const over = [];
  if (peak.calls > limit.calls) over.push({ scene, what: 'draw calls', value: peak.calls, limit: limit.calls });
  if (peak.triangles > limit.triangles) over.push({ scene, what: 'triangles', value: peak.triangles, limit: limit.triangles });
  return over;
}

/** A budget for a measured peak: the peak plus headroom, rounded up to a tidy number. */
export function budgetFor(peak) {
  const tidy = (n) => {
    const step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10;
    return Math.ceil((n * HEADROOM) / step) * step;
  };
  return { calls: tidy(peak.calls), triangles: tidy(peak.triangles) };
}

export const readPng = (buffer) => PNG.sync.read(buffer);
export const writePng = (png) => PNG.sync.write(png);

export async function readBudgets() {
  try {
    return JSON.parse(await readFile(BUDGET_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function writeBudgets(budgets) {
  const sorted = Object.fromEntries(Object.entries(budgets).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(BUDGET_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export async function readBaseline(name) {
  try {
    return readPng(await readFile(`${BASELINES}${name}.png`));
  } catch {
    return null;
  }
}

export async function writeBaseline(name, png) {
  await mkdir(BASELINES, { recursive: true });
  await writeFile(`${BASELINES}${name}.png`, writePng(png));
}
