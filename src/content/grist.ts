import { Grist } from '../game/grist';
import type { Enemy } from '../game/enemies';
import type { Script, ScriptApi } from '../game/script';
import type { Overworld } from '../world/overworld';
import { SPAWN, terrainHeight } from '../world/overworld/layout';
import { G } from './text/grist';

/**
 * Grist, the Stonesick (game/grist.ts). For now he wanders a few meters
 * ahead and left of the new game's spawn, so he's the first thing to walk up to. Talk to him: a couple of questions,
 * and whichever way Wren answers about the shrine, he takes offence and the fight starts (`grist.hostile`, saved).
 * "Leave" parts on good terms. Without a sword he only sends Wren home (the Lamplighter's rule: no fight unarmed).
 * Once hostile he follows the checkpoint rule (back at his spot after a death, still hostile); once beaten
 * (`grist.defeated`) he's gone for good, like a boss.
 */
export const GRIST_HOME = { x: SPAWN.x - 4, z: SPAWN.z - 8 };

export function gristContent(ow: Overworld) {
  let grist: Grist | null = null;

  ow.interactables.push({
    id: 'npc.grist',
    get x() {
      return grist?.pos.x ?? GRIST_HOME.x;
    },
    get z() {
      return grist?.pos.z ?? GRIST_HOME.z;
    },
    r: 3.2,
    label: 'Talk',
    get promptY() {
      return (grist?.pos.y ?? 0) + 3.4;
    },
    enabled: () => !!grist && grist.alive && grist.peaceful,
  });

  const spawn = (api: ScriptApi) => {
    const { x, z } = GRIST_HOME;
    const g = new Grist(ow.root, api.physics, x, z, terrainHeight(x, z) + 2, api.state.has('grist.hostile'));
    g.faceAngle(Math.PI * 0.85);
    g.onProvoked = () => api.state.set('grist.hostile');
    g.onDefeated = () => api.state.set('grist.defeated');
    api.addEnemy(g);
    grist = g;
  };

  const talk: Script = async (api) => {
    const g = grist;
    if (!g?.peaceful) return;
    const { state } = api;
    const who = G.who;
    const say = (...texts: string[]) => api.say(texts.map((text) => ({ who, text })));
    g.beginTalk();
    let offended = false;
    try {
      if (!state.has('hasSword')) {
        await say(G.unarmed);
        return;
      }
      if (state.has('valleyOpen')) {
        const O = G.open;
        if (!state.has('grist.met')) {
          const sky = await api.ask([{ who, text: O.open }, { who, text: O.askSky }], O.skyOptions);
          await say(sky === 0 ? O.skyYes : O.skyNo);
        } else await say(G.again);
        state.set('grist.met');
        const a = await api.ask([{ who, text: O.askWho }], O.whoOptions, 2);
        if (a === 2) await say(O.leave);
        else {
          offended = true;
          await say(...(a === 0 ? O.admit : O.deny));
        }
      } else {
        const D = G.dark;
        await (state.has('grist.met') ? say(G.again) : say(...D.open));
        state.set('grist.met');
        const a = await api.ask([{ who, text: D.ask }], D.options, 2);
        if (a === 2) await say(D.leave);
        else {
          offended = true;
          await say(...(a === 0 ? D.shrine : D.nowhere));
        }
      }
    } finally {
      if (offended) state.set('grist.hostile');
      g.endTalk(offended);
    }
  };

  return {
    scripts: { 'npc.grist': talk } as Record<string, Script>,

    /** A death: he's back at his spot (hostile if he was). */
    onRespawn(api: ScriptApi) {
      if (grist) api.removeEnemy(grist as Enemy);
      grist = null;
    },

    update(api: ScriptApi) {
      if (grist?.gone) grist = null;
      if (!grist && !api.state.has('grist.defeated')) spawn(api);
    },
  };
}
