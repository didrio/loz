import * as THREE from 'three';
import { GroundEnemy, Thornling, type Enemy } from '../game/enemies';
import type { ScriptApi } from '../game/script';
import { DozingSentinel } from '../game/sentinel';
import { TrialFalls } from '../game/trialFalls';
import type { Overworld } from '../world/overworld';
import { GORGE_COURSE, GORGE_SENTINEL, GORGE_THORNLINGS, gorgeAt, onGorgeFloor, sentinelFacing } from '../world/overworld/gorge';
import { GORGE, gorgeFrame, terrainHeight } from '../world/overworld/layout';

/**
 * The Hushing Gorge's content (docs/bells.md, 3b): its monsters, standing at fixed spots, and the trial rule on the
 * climb (a fall puts Wren back on the last pillar she stood on). The bell itself is bound in `content/overworld.ts`.
 */
export function gorgeContent(ow: Overworld) {
  const fixed = GORGE_COURSE.platforms.filter((p) => p.checkpoint && !p.move)
    .map((p) => ({ x: p.x, z: p.z, hw: p.r * 0.7, hd: p.r * 0.7, top: p.top }));
  const startAt = () => new THREE.Vector3(fixed[0].x, fixed[0].top, fixed[0].z);
  let trial = new TrialFalls(fixed, GORGE_COURSE.fallY, startAt());
  let enemies: Enemy[] = [];

  /** Every monster back at its spot (on load and after a death; the checkpoint rule). */
  const spawn = (api: ScriptApi) => {
    for (const e of enemies) api.removeEnemy(e);
    enemies = [];
    const stand = (e: GroundEnemy, facing?: number) => {
      e.setWalkable(onGorgeFloor);
      if (facing !== undefined) e.faceAngle(facing);
      api.addEnemy(e);
      enemies.push(e);
    };
    for (const [s, lat] of GORGE_THORNLINGS) {
      const { x, z } = gorgeAt(s, lat);
      stand(new Thornling(ow.root, api.physics, x, z, terrainHeight(x, z) + 1, onGorgeFloor));
    }
    const { x, z } = gorgeAt(GORGE_SENTINEL[0], GORGE_SENTINEL[1]);
    stand(new DozingSentinel(ow.root, api.physics, x, z, terrainHeight(x, z) + 1, onGorgeFloor, sentinelFacing()), sentinelFacing());
    trial = new TrialFalls(fixed, GORGE_COURSE.fallY, startAt());
  };

  return {
    start: spawn,
    onRespawn: spawn,
    update(api: ScriptApi) {
      const pos = api.player.pos;
      const { d, s } = gorgeFrame(pos.x, pos.z);
      const inside = d < GORGE.wallTop;
      api.player.edgeAssist = inside;
      // Only past the pit's lip: the mouth's ground is lower than the fall line.
      if (inside && s > GORGE.pitAt - 4 && trial.check(pos, api.player.grounded)) api.run((a) => trial.recover(a));
    },
  };
}
