import { gatherPoints, occluderTree, POINT_STRIDE, TERM_STRIDE } from './bakeGather';
import type { GatherReply, GatherRequest } from './bakeWorker';

/**
 * A few background threads for the light bake (render/bakeLight.ts), like a render farm beside the game: the world
 * shows at once and its baked colours arrive when the rays are done. Each job's points are dealt out round-robin
 * (point i to worker i mod n), so a dense village and an empty field share the work evenly; every worker builds
 * its own occluder tree. Without `Worker` (unit tests, Node) the gather runs on the spot.
 */
let workers: Worker[] | null = null;
let nextJob = 1;
const waiting = new Map<number, (terms: Float32Array) => void>();

function pool() {
  if (workers) return workers;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  workers = [];
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./bakeWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<GatherReply>) => {
      const done = waiting.get(e.data.job);
      waiting.delete(e.data.job);
      done?.(e.data.terms);
    };
    workers.push(w);
  }
  return workers;
}

/** The terms (`TERM_STRIDE` floats per point, in the points' order) for `points` against the occluder soup. */
export function gatherInBackground(occPos: Float32Array, occAlb: Float32Array, points: Float32Array, rays: number, reach: number): Promise<Float32Array> {
  if (typeof Worker === 'undefined') return Promise.resolve(gatherPoints(occluderTree(occPos), occAlb, points, rays, reach));
  const ws = pool();
  const n = ws.length;
  const count = points.length / POINT_STRIDE;
  const parts = ws.map((w, k) => {
    const mine = Math.ceil(Math.max(0, count - k) / n);
    const chunk = new Float32Array(mine * POINT_STRIDE);
    for (let i = k, j = 0; i < count; i += n, j++) chunk.set(points.subarray(i * POINT_STRIDE, (i + 1) * POINT_STRIDE), j * POINT_STRIDE);
    const job = nextJob++;
    return new Promise<Float32Array>((resolve) => {
      waiting.set(job, resolve);
      w.postMessage({ job, occPos, occAlb, points: chunk, rays, reach } satisfies GatherRequest, [chunk.buffer]);
    });
  });
  return Promise.all(parts).then((results) => {
    const out = new Float32Array(count * TERM_STRIDE);
    results.forEach((terms, k) => {
      for (let i = k, j = 0; i < count; i += n, j++) out.set(terms.subarray(j * TERM_STRIDE, (j + 1) * TERM_STRIDE), i * TERM_STRIDE);
    });
    return out;
  });
}
