import * as THREE from 'three';
import { Cragstalker } from '../game/cragstalker';
import type { Enemy } from '../game/enemies';
import type { ScriptApi } from '../game/script';
import { TrialFalls } from '../game/trialFalls';
import type { Overworld } from '../world/overworld';
import { beyondAt, CANYON_COURSE, CRAGSTALKER_AT, inCrossing, inStalkerRange, onFarSide } from '../world/overworld/camp';
import { terrainHeight } from '../world/overworld/layout';

/**
 * Wayfarers' Camp and the canyon beyond it (docs/bells.md, D3): the Cragstalker that guards the Waybell, and the
 * trial rule on the crossing (a fall puts Wren back on the last ledge she stood on). The Cragstalker only exists
 * while the Northpass is built (its ground is part of the region); it stays down once killed, until a death.
 */
export function northpassContent(ow: Overworld) {
  const fixed = CANYON_COURSE.platforms.filter((p) => p.checkpoint && !p.move)
    .map((p) => ({ x: p.x, z: p.z, hw: p.r * 0.7, hd: p.r * 0.7, top: p.top }));
  const startAt = () => new THREE.Vector3(fixed[0].x, fixed[0].top, fixed[0].z);
  let trial = new TrialFalls(fixed, CANYON_COURSE.fallY, startAt());
  let stalker: Cragstalker | null = null;
  let defeated = false;

  const clear = (api: ScriptApi) => {
    if (stalker) api.removeEnemy(stalker as Enemy);
    stalker = null;
  };

  return {
    /** A death: the Cragstalker is back, the crossing forgets where Wren stood. */
    onRespawn(api: ScriptApi) {
      clear(api);
      defeated = false;
      trial = new TrialFalls(fixed, CANYON_COURSE.fallY, startAt());
    },

    update(api: ScriptApi) {
      const loaded = ow.loadedRegions.includes('northpass');
      if (stalker && !stalker.alive) defeated = true;
      if (!loaded) clear(api);
      else if (!stalker && !defeated) {
        const { x, z } = beyondAt(CRAGSTALKER_AT);
        stalker = new Cragstalker(ow.root, api.physics, x, z, terrainHeight(x, z) + 1, inStalkerRange);
        stalker.setWalkable(onFarSide);
        stalker.faceAngle(Math.PI); // toward the gap: south
        api.addEnemy(stalker);
      }
      const pos = api.player.pos;
      if (!inCrossing(pos.x, pos.z)) return;
      api.player.edgeAssist = true;
      if (trial.check(pos, api.player.grounded)) api.run((a) => trial.recover(a));
    },
  };
}
