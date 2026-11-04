import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/math';
import { initPhysics, Physics } from '../core/physics';
import { GameState } from '../game/state';
import { AreaBuilder } from '../world/area';
import { BELL_IDS, BellPickup } from '../world/bell';
import { DungeonArea } from '../world/dungeon/build';
import { DUNGEONS } from '../world/dungeon';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { Overworld } from '../world/overworld';
import { BELLS, bellContent, answering, emptyPostText, liftVillageBell, settleVillageBell } from './bells';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';
import { shrineContent } from './shrine';

beforeAll(async () => {
  await initPhysics();
});

describe('the keepers\' bells', () => {
  let physics: Physics;
  let ow: Overworld;
  let shrine: DungeonArea;

  beforeAll(() => {
    physics = new Physics();
    ow = new Overworld(physics);
    shrine = new DungeonArea(physics, SHRINE);
    physics.refreshQueries();
  });

  it('every bell has exactly one post in the game, and an entrance in front of it where its registry says', () => {
    const areas = { overworld: ow, shrine } as const;
    for (const id of BELL_IDS) {
      const b = BELLS[id];
      expect(b.id).toBe(id);
      const posts = [...ow.bellPosts.keys(), ...DUNGEONS.flatMap((d) => d.things.flatMap((t) => (t.kind === 'bellPost' ? [t.bell] : [])))].filter((p) => p === id);
      expect(posts, id).toHaveLength(1);
      const area = areas[b.area as keyof typeof areas];
      expect(area.bellPosts.get(id), id).toBeDefined();
      expect(area.entrances[b.entrance], `${id} arrives at ${b.entrance}`).toBeDefined();
    }
  });

  it('an empty post says something hung there, names its bell, and knows a wrong bell', () => {
    const s = new GameState();
    expect(emptyPostText(s, 'morrow')).toContain('Something hung here once.');
    expect(emptyPostText(s, 'morrow')).toContain('MORROW');
    s.bells.carried.add('lull');
    expect(emptyPostText(s, 'morrow')).toContain('[gear]Lullbell[/] doesn\'t belong here');
    s.bells.carried.clear();
    s.bells.hung.add('morrow');
    expect(emptyPostText(s, 'lull')).toContain('Another empty hook');
  });

  it('the first bell hung rings, and nothing answers: no menu, no travel', async () => {
    const { api, state, said, chosen, travels } = fakeApi(ow, physics);
    const { scripts, restore } = overworldContent(ow);
    state.bells.carried.add('morrow');
    restore(state);
    expect(ow.morrowPost.label).toBe('Hang bell');
    await scripts['bellPost.morrow'](api);
    ow.morrowPost.update(2); // the bell floats up and settles
    expect([...state.bells.hung]).toEqual(['morrow']);
    expect(state.bells.carried.size).toBe(0);
    expect(ow.morrowPost.hung).toBe(true);
    expect(ow.morrowPost.label).toBe('Ring');
    expect(said.map((p) => p.text).join(' ')).toContain('nothing answers');
    expect(chosen).toEqual([]);
    expect(travels).toEqual([]);
  });

  it('the second bell hung is answered, teaches ringing, and offers the way to the first', async () => {
    const area = new DungeonArea(physics, SHRINE);
    const { api, state, said, chosen, choices, travels } = fakeApi(area, physics);
    const content = shrineContent(area);
    state.bells.hung.add('morrow');
    state.bells.carried.add('lull');
    content.restore(state);
    choices.push(0);
    await content.scripts.lullPost(api);
    const text = said.map((p) => p.text).join(' ');
    expect(text).toContain('[gear]Morrowbell[/] answers');
    expect(text).toContain('[interact]');
    expect(chosen).toEqual([{ title: 'Follow the answer', options: ['Thistledown', 'Stay'] }]);
    expect(travels).toEqual([{ area: 'overworld', entrance: 'bell.morrow' }]);
    expect([...state.bells.hung].sort()).toEqual(['lull', 'morrow']);
    area.dispose();
  });

  it('ringing with others hung offers them; Stay or backing out goes nowhere; hearts never change', async () => {
    const { api, state, chosen, choices, travels } = fakeApi(ow, physics);
    const { scripts, restore } = overworldContent(ow);
    state.bells.hung.add('morrow');
    state.bells.hung.add('lull');
    state.hp = 3;
    restore(state);
    choices.push(1, null, 0);
    for (let i = 0; i < 3; i++) await scripts['bellPost.morrow'](api);
    expect(chosen.map((c) => c.options)).toEqual([['Hall of Sleepers', 'Stay'], ['Hall of Sleepers', 'Stay'], ['Hall of Sleepers', 'Stay']]);
    expect(travels).toEqual([{ area: 'shrine', entrance: 'lullPost' }]);
    expect(state.hp).toBe(3); // bells don't rest you: only a bed does
  });

  it('a lone hung bell rings with no menu', async () => {
    const { api, state, said, chosen } = fakeApi(ow, physics);
    const { scripts, restore } = overworldContent(ow);
    state.bells.hung.add('morrow');
    restore(state);
    await scripts['bellPost.morrow'](api);
    expect(chosen).toEqual([]);
    expect(said.at(-1)!.text).toContain('over the roofs... and nothing answers');
  });

  it('Maren and Tobin each say one line about the Morrowbell, once, after it\'s hung', async () => {
    const area = new Overworld(physics);
    const { api, state, said } = fakeApi(area, physics);
    const { scripts } = overworldContent(area);
    for (const f of ['metMaren', 'gotGroveKey', 'groveChestOpened', 'hasSword', 'village.millKey'] as const) state.set(f);
    const talk = async (id: string) => {
      said.length = 0;
      await scripts[id](api);
      return said.map((p) => p.text).join(' ');
    };
    expect(await talk('npc.maren')).not.toContain('bell');
    state.bells.hung.add('morrow');
    expect(await talk('npc.maren')).toContain('Old Hesper said');
    expect(await talk('npc.maren')).not.toContain('Old Hesper said');
    expect(await talk('npc.tobin')).toContain('That bell over');
    expect(await talk('npc.tobin')).not.toContain('That bell over');
    area.dispose();
  });

  describe('the village goes quiet when Gravelheart falls', () => {
    it('only a hung Morrowbell is taken off its post, and the flag says so', () => {
      const s = new GameState();
      expect(liftVillageBell(s)).toBe(false);
      expect(s.has('village.bellMoved')).toBe(false);
      s.bells.carried.add('morrow');
      expect(liftVillageBell(s)).toBe(false);
      s.bells.carried.clear();
      s.bells.hung.add('morrow');
      s.bells.hung.add('lull');
      expect(liftVillageBell(s)).toBe(true);
      expect([...s.bells.hung]).toEqual(['lull']);
      expect(s.has('village.bellMoved')).toBe(true);
    });

    it('a save with the boss beaten and the Morrowbell still hung (older saves, dev states) is settled on load, once', () => {
      const s = new GameState();
      s.bells.hung.add('morrow');
      s.bells.hung.add('lull');
      expect(settleVillageBell(s)).toBe(false); // the boss still lives
      expect(s.bells.hung.has('morrow')).toBe(true);
      s.dungeon('shrine').done = true;
      expect(settleVillageBell(s)).toBe(true);
      expect([...s.bells.hung]).toEqual(['lull']);
      expect(answering(s, 'lull')).toEqual([]);
      s.bells.hung.add('morrow'); // rehung by hand
      s.set('village.bellMoved');
      expect(settleVillageBell(s)).toBe(false);
      expect(s.bells.hung.has('morrow')).toBe(true);
    });

    it('the dungeon bell then rings as if alone, the other bells still answer each other, and rehanging restores the menu', async () => {
      const area = new DungeonArea(physics, SHRINE);
      const { api, state, said, chosen, choices, travels } = fakeApi(area, physics);
      const content = shrineContent(area);
      state.bells.hung.add('morrow');
      state.bells.hung.add('lull');
      liftVillageBell(state);
      content.restore(state);
      await content.scripts.lullPost(api);
      expect(chosen).toEqual([]);
      expect(said.at(-1)!.text).toBe(`${BELLS.lull.carries}... and nothing answers.`);
      state.bells.hung.add('way');
      choices.push(0);
      await content.scripts.lullPost(api);
      expect(chosen).toEqual([{ title: 'Follow the answer', options: [BELLS.way.site, 'Stay'] }]);
      expect(travels).toEqual([{ area: 'overworld', entrance: 'bell.way' }]);
      state.bells.hung.add('morrow');
      choices.length = 0;
      choices.push(null);
      await content.scripts.lullPost(api);
      expect(chosen.at(-1)!.options).toEqual([BELLS.morrow.site, BELLS.way.site, 'Stay']);
      area.dispose();
    });

    it('the bell lies behind the mill, the gorge plinth stays empty, and taking it lets the post take it back', async () => {
      const { api, state } = fakeApi(ow, physics);
      const { scripts, restore } = overworldContent(ow);
      state.bells.hung.add('morrow');
      liftVillageBell(state);
      restore(state);
      expect(ow.morrowPost.hung).toBe(false);
      expect(ow.morrowLost.present).toBe(true);
      expect(ow.morrowBell.present).toBe(false);
      expect(ow.morrowPost.label).toBe('Check');
      await scripts['bellPickup.morrowLost'](api);
      expect(ow.morrowLost.present).toBe(false);
      expect([...state.bells.carried]).toEqual(['morrow']);
      expect(ow.morrowPost.canHang).toBe(true);
      await scripts['bellPost.morrow'](api);
      ow.morrowPost.update(2);
      expect([...state.bells.hung]).toEqual(['morrow']);
      restore(state);
      expect(ow.morrowLost.present).toBe(false);
      expect(ow.morrowBell.present).toBe(false);
    });
  });

  it('taking a bell carries it, readies its post in the same area, and a save brings neither back', async () => {
    const b = new AreaBuilder(physics, mulberry32(1));
    const pickup = new BellPickup(b, 'morrow', 0, 0, 0);
    const { api, state, said } = fakeApi(ow, physics);
    const bells = bellContent({ 'bellPost.morrow': ow.morrowPost }, { 'bell.morrow': pickup });
    ow.morrowPost.canHang = false;
    await bells.scripts['bell.morrow'](api);
    expect(pickup.present).toBe(false);
    expect([...state.bells.carried]).toEqual(['morrow']);
    expect(ow.morrowPost.canHang).toBe(true);
    expect(said[0].text).toContain('[gear]Morrowbell[/]. The keepers rang the dawn');

    const fresh = new BellPickup(b, 'morrow', 0, 0, 0);
    bellContent({}, { 'bell.morrow': fresh }).restore(state);
    expect(fresh.present).toBe(false);
    b.finish().dispose();
  });
});
