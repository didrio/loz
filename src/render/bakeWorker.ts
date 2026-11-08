import { gatherPoints, occluderTree } from './bakeGather';

/**
 * A light-bake worker (render/bakePool.ts runs a few): builds the occluder tree for a job, gathers its share of the
 * points, and sends the terms back. One message at a time, so jobs queue up in order.
 */
export interface GatherRequest {
  job: number;
  occPos: Float32Array;
  occAlb: Float32Array;
  points: Float32Array;
  rays: number;
  reach: number;
}

export interface GatherReply {
  job: number;
  terms: Float32Array;
}

self.onmessage = (e: MessageEvent<GatherRequest>) => {
  const { job, occPos, occAlb, points, rays, reach } = e.data;
  const terms = gatherPoints(occluderTree(occPos), occAlb, points, rays, reach);
  (self as unknown as Worker).postMessage({ job, terms } satisfies GatherReply, [terms.buffer]);
};
