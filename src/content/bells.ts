import * as THREE from 'three';
import type { Script, ScriptApi } from '../game/script';
import type { Flag, GameState } from '../game/state';
import { BELL_IDS, type BellId, type BellPickup, type BellPost } from '../world/bell';
import type { AreaId } from './areas';

/**
 * The keepers' bells (docs/bells.md): what finding, hanging and ringing one does. A bell is
 * found at the end of its trial and carried (nothing on the HUD), then hung on its own post
 * (its name is carved on the arm). A lone hung bell rings and nothing answers; two or more
 * answer each other, and ringing one offers to follow the answer to any other: fast travel.
 * Bells never heal or rest Wren (only a bed does). Areas bind their posts and pickups with
 * `bellContent`.
 */

export interface BellSite {
  id: BellId;
  name: string;
  /** What's carved on its post's arm. */
  carving: string;
  /** Where its post stands: a row in the travel menu. */
  site: string;
  /** Its post's area, and the entrance in front of the post where travelers arrive. */
  area: AreaId;
  entrance: string;
  /** Its note (Hz): the Morrowbell rings A4, the Lullbell the D a fifth below. */
  note: number;
  /** The second line when it's found: which hour it rang, and a nudge toward its post. */
  found: string;
  /** Where its note goes when it's rung (for "...and nothing answers"). */
  carries: string;
}

export const BELLS: Record<BellId, BellSite> = {
  morrow: {
    id: 'morrow', name: 'Morrowbell', carving: 'MORROW', site: 'Thistledown', area: 'overworld', entrance: 'bell.morrow', note: 440,
    found: 'The shrine\'s keepers rang the dawn with it, and Thistledown woke to its note. Its post must still stand somewhere in the village.',
    carries: 'Its bright note rolls out over Thistledown\'s roofs and away across the valley',
  },
  lull: {
    id: 'lull', name: 'Lullbell', carving: 'LULL', site: 'Hall of Sleepers', area: 'shrine', entrance: 'lullPost', note: 293.66,
    found: 'The keepers rang it at dusk, to tell the shrine\'s stones it was time to sleep. Its post can\'t be far: somewhere in these halls.',
    carries: 'Its low note rolls away through the sleeping halls',
  },
  way: {
    id: 'way', name: 'Waybell', carving: 'WAY', site: 'Wayfarers\' Camp', area: 'overworld', entrance: 'bell.way', note: 329.63,
    found: 'The keepers rang it at noon, to call travelers in off the pass. Its post must stand at the camp, back across the gap.',
    carries: 'Its green note rolls down the pass and out over the valley',
  },
};

/**
 * Bells Gravelheart's fall takes off their posts (docs/bells.md, "The village goes quiet"): the flag says it happened, and the bell
 * then lies on the ground somewhere in the valley until Wren hangs it again.
 */
const BELL_MOVED: Partial<Record<BellId, Flag>> = { morrow: 'village.bellMoved' };

/**
 * The boss is beaten: the village's bell is taken off its post (if it was hung), so the first thing Wren sees of the valley is
 * on foot. Nothing answers the other bells until it is hung again. Returns whether it moved.
 */
export function liftVillageBell(state: GameState) {
  if (!state.bells.hung.delete('morrow')) return false;
  state.set('village.bellMoved');
  return true;
}

/** The other hung bells, the ones that answer `bell`. */
export function answering(state: GameState, bell: BellId) {
  return BELL_IDS.filter((id) => id !== bell && state.bells.hung.has(id)).map((id) => BELLS[id]);
}

/** What a post with an empty hook says, depending on what Wren knows and carries. */
export function emptyPostText(state: GameState, post: BellId) {
  const carving = `Carved into the arm: [old]${BELLS[post].carving}[/].`;
  const carried = [...state.bells.carried].find((b) => b !== post);
  if (carried) return `The hook is empty. ${carving}\nThe [gear]${BELLS[carried].name}[/] you carry doesn't belong here.`;
  if (state.bells.hung.size) return `Another bell post, its hook empty. ${carving}`;
  return `A crooked post with one arm and an empty hook. Does something go here?\n${carving}`;
}

/** Where the camera watches a post from: in front and off to the side, looking at the bell. */
function postShot(api: ScriptApi, post: BellPost) {
  const at = post.bellWorld();
  const out = new THREE.Vector3(post.front.x - post.x, 0, post.front.z - post.z).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  api.shot(at.clone().addScaledVector(out, 4.2).addScaledVector(side, 1.6).setY(at.y + 0.6), at);
}

async function hangBell(api: ScriptApi, post: BellPost) {
  const { bells } = api.state;
  const bell = BELLS[post.bell];
  postShot(api, post);
  post.hang(api.player.pos.clone().setY(api.player.pos.y + 1.1));
  bells.carried.delete(post.bell);
  bells.hung.add(post.bell);
  post.canHang = false;
  await api.until(() => !post.hanging);
  api.sfx.bell(bell.note, 0.35);
  await api.wait(0.5);
  await api.say([{ text: `You hung the [gear]${bell.name}[/] back on its post.` }]);
  // It rings once by itself, as if it had been waiting to.
  post.ring();
  api.sfx.bell(bell.note);
  await api.wait(1.4);
  const others = answering(api.state, post.bell);
  if (!others.length) {
    await api.say([{ text: `${bell.carries}... and nothing answers.` }]);
    return;
  }
  // The second bell: the network wakes up, and the game says what it means.
  others.forEach((o, i) => api.sfx.bell(o.note, 0.3, i * 0.35));
  await api.wait(1.2);
  await api.say([
    { text: `Far away, the [gear]${others[0].name}[/] answers. The two notes hang in the air together, like a road strung between them.` },
    { text: 'Ring a bell with [interact], and you can follow its answer to any other bell that\'s hung.' },
  ]);
  await travelMenu(api, post);
}

async function ringBell(api: ScriptApi, post: BellPost) {
  const bell = BELLS[post.bell];
  postShot(api, post);
  post.ring();
  api.sfx.bell(bell.note);
  const others = answering(api.state, post.bell);
  if (!others.length) {
    await api.wait(1.4);
    await api.say([{ text: `${bell.carries}... and nothing answers.` }]);
    return;
  }
  // The others answer from far off, one after another.
  others.forEach((o, i) => api.sfx.bell(o.note, 0.3, 0.8 + i * 0.35));
  await api.wait(1.2);
  await travelMenu(api, post);
}

/** Follow the answer: pick a hung bell (or stay), travel there, and it rings as Wren arrives. */
async function travelMenu(api: ScriptApi, post: BellPost) {
  const others = answering(api.state, post.bell);
  const pick = await api.choose('Follow the answer', [...others.map((o) => o.site), 'Stay']);
  if (pick === null || pick >= others.length) return;
  const to = others[pick];
  api.releaseCamera();
  await api.travel(to.area, to.entrance);
  const arrived = api.area.bellPosts?.get(to.id);
  if (arrived) {
    arrived.ring(0.6);
    api.sfx.bell(to.note, 0.6);
  }
}

/** Using a post: check its empty hook, hang its bell, or ring it. */
export function bellPostScript(post: BellPost): Script {
  return async (api) => {
    const { bells } = api.state;
    if (bells.hung.has(post.bell)) await ringBell(api, post);
    else if (bells.carried.has(post.bell)) await hangBell(api, post);
    else await api.say([{ text: emptyPostText(api.state, post.bell) }]);
  };
}

/** Taking a bell from the end of its trial. `posts`: this area's posts (one may fit it). */
export function bellPickupScript(pickup: BellPickup, posts: Iterable<BellPost>): Script {
  return async (api) => {
    const bell = BELLS[pickup.bell];
    pickup.take();
    api.state.bells.carried.add(pickup.bell);
    for (const p of posts) if (p.bell === pickup.bell) p.canHang = true;
    api.sfx.fanfare();
    api.sfx.bell(bell.note, 0.4, 0.5);
    await api.say([{ text: `You found the [gear]${bell.name}[/]!\n${bell.found}` }]);
  };
}

/**
 * An area's bell scripts (by interactable id) and how to restore them from a save: hung
 * bells back on their hooks, taken bells gone from their plinths.
 */
export function bellContent(posts: Record<string, BellPost>, pickups: Record<string, BellPickup> = {}, lost: Record<string, BellPickup> = {}) {
  const scripts: Record<string, Script> = {};
  for (const [id, post] of Object.entries(posts)) scripts[id] = bellPostScript(post);
  for (const [id, pickup] of Object.entries({ ...pickups, ...lost })) scripts[id] = bellPickupScript(pickup, Object.values(posts));
  return {
    scripts,
    restore(state: GameState) {
      for (const post of Object.values(posts)) {
        if (state.bells.hung.has(post.bell)) post.setHung();
        else if (post.hung) post.setEmpty();
        post.canHang = state.bells.carried.has(post.bell);
      }
      // A bell that was ever found never reappears on its plinth, even when it was taken off its post.
      const wasMoved = (bell: BellId) => {
        const flag = BELL_MOVED[bell];
        return flag !== undefined && state.has(flag);
      };
      for (const p of Object.values(pickups)) {
        if (p.present && (state.bells.carried.has(p.bell) || state.bells.hung.has(p.bell) || wasMoved(p.bell))) p.take();
      }
      for (const p of Object.values(lost)) {
        const moved = wasMoved(p.bell);
        if (moved && !state.bells.carried.has(p.bell) && !state.bells.hung.has(p.bell)) p.show();
        else p.take();
      }
    },
  };
}
