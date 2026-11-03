import * as THREE from 'three';
import { Cragstalker } from '../game/cragstalker';
import type { Enemy } from '../game/enemies';
import type { ScriptApi } from '../game/script';
import { TrialFalls } from '../game/trialFalls';
import type { Overworld } from '../world/overworld';
import { beyondAt, CANYON_COURSE, CRAGSTALKERS_AT, inCrossing, inStalkerRange, onFarSide } from '../world/overworld/camp';
import { terrainHeight } from '../world/overworld/layout';

/**
 * Wayfarers' Camp and the canyon beyond it (docs/bells.md, D3): the two Cragstalkers that guard the Waybell, and the
 * trial rule on the crossing (a fall puts Wren back on the last ledge she stood on). The Cragstalkers only exist
 * while the Northpass is built (its ground is part of the region); each stays down once killed, until a death.
 */
export function northpassContent(ow: Overworld) {
  const fixed = CANYON_COURSE.platforms.filter((p) => p.checkpoint && !p.move)
    .map((p) => ({ x: p.x, z: p.z, hw: p.r * 0.7, hd: p.r * 0.7, top: p.top }));
  const startAt = () => new THREE.Vector3(fixed[0].x, fixed[0].top, fixed[0].z);
  let trial = new TrialFalls(fixed, CANYON_COURSE.fallY, startAt());
  /** One slot per post in `CRAGSTALKERS_AT`: the live enemy, and whether Wren has killed it. */
  const stalkers: (Cragstalker | null)[] = CRAGSTALKERS_AT.map(() => null);
  const defeated = CRAGSTALKERS_AT.map(() => false);

  const clear = (api: ScriptApi) => {
    stalkers.forEach((s, i) => {
      if (s) api.removeEnemy(s as Enemy);
      stalkers[i] = null;
    });
  };

  return {
    /** A death: the Cragstalkers are back, the crossing forgets where Wren stood. */
    onRespawn(api: ScriptApi) {
      clear(api);
      defeated.fill(false);
      trial = new TrialFalls(fixed, CANYON_COURSE.fallY, startAt());
    },

    update(api: ScriptApi) {
      const loaded = ow.loadedRegions.includes('northpass');
      stalkers.forEach((s, i) => {
        if (s && !s.alive) defeated[i] = true;
      });
      if (!loaded) clear(api);
      else {
        CRAGSTALKERS_AT.forEach(([s, lat], i) => {
          if (stalkers[i] || defeated[i]) return;
          const { x, z } = beyondAt(s, lat);
          const c = new Cragstalker(ow.root, api.physics, x, z, terrainHeight(x, z) + 1, inStalkerRange);
          c.setWalkable(onFarSide);
          c.faceAngle(Math.PI); // toward the gap: south
          api.addEnemy(c);
          stalkers[i] = c;
        });
      }
      const pos = api.player.pos;
      if (!inCrossing(pos.x, pos.z)) return;
      api.player.edgeAssist = true;
      if (trial.check(pos, api.player.grounded)) api.run((a) => trial.recover(a));
    },
  };
}
