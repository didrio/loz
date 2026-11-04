import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { GameState } from '../game/state';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';
import { intro } from './story';

beforeAll(async () => {
  await initPhysics();
});

describe('overworld content', () => {
  let ow: Overworld;
  let physics: Physics;

  beforeAll(() => {
    physics = new Physics();
    ow = new Overworld(physics);
    physics.refreshQueries();
  });

  it('has a script for every interactable and trigger', () => {
    const { scripts } = overworldContent(ow);
    for (const it of [...ow.interactables, ...ow.triggers]) expect(scripts[it.id], it.id).toBeTypeOf('function');
  });

  it('the gate stays shut until the Keepers\' seal is broken, then stays open; its sign says which', async () => {
    const area = new Overworld(physics);
    const { api, state, said } = fakeApi(area, physics);
    const { scripts, restore } = overworldContent(area);
    restore(state);
    expect(area.gate.isOpen).toBe(false);
    await scripts['sign.gate'](api);
    expect(said.at(-1)!.text).toMatch(/gate of floating stone/);
    state.set('valleyOpen');
    restore(state);
    expect(area.gate.isOpen).toBe(true);
    await scripts['sign.gate'](api);
    expect(said.at(-1)!.text).toMatch(/gate has fallen/);
  });

  it('lets the player stand on the ground at the spawn point', () => {
    const y = physics.groundY(ow.spawn.x, ow.spawn.z);
    expect(y).not.toBeNull();
  });

  it('plays the quest in order: locked chest, Maren\'s key, sword, rumors of the hollow, a sealed door', async () => {
    const area = new Overworld(physics);
    const { api, state, said } = fakeApi(area, physics);
    const { scripts } = overworldContent(area);
    const text = () => said.map((p) => p.text).join(' ');

    // Straight to the grove: the chest is locked, and the game points to the village.
    await scripts['chest.grove'](api);
    expect(area.chest.opened).toBe(false);
    expect(state.has('hasSword')).toBe(false);
    expect(text()).toContain('Thistledown');

    // The opening: the shield first, which sets off the scare; then Maren gives the key.
    await scripts['pickup.shield'](api);
    expect(state.has('village.scare')).toBe(true);
    await scripts['npc.maren'](api);
    expect(state.has('metMaren')).toBe(true);
    expect(state.keys).toBe(1);

    await scripts['chest.grove'](api);
    expect(state.has('hasSword')).toBe(true);
    expect(area.chest.opened).toBe(true);
    expect(state.keys).toBe(0);

    // Armed, the village talk turns to the stolen flame and the Gloaming Hollow.
    said.length = 0;
    await scripts['npc.maren'](api);
    expect(text()).toContain('Gloaming Hollow');
    said.length = 0;
    await scripts['npc.tobin'](api);
    expect(text()).toContain('Gloaming Hollow');

    // The door stays shut: only the relit lantern wakes it.
    await scripts['door.shrine'](api);
    expect(area.door.opening).toBe(false);
    expect(state.has('shrineOpen')).toBe(false);
    area.dispose();
  });

  it('a new game opens without words', async () => {
    const area = new Overworld(physics);
    const { api, said } = fakeApi(area, physics);
    const shots: unknown[] = [];
    api.shot = (...a) => void shots.push(a);
    await intro(api);
    expect(said).toHaveLength(0);
    expect(shots).toHaveLength(0);
    area.dispose();
  });

  it('the opening is told by talking: scolding, Lark\'s tip, the shield and a quick scream, then Maren\'s key', async () => {
    const area = new Overworld(physics);
    const { api, state, said } = fakeApi(area, physics);
    const { scripts, restore } = overworldContent(area);
    const talk = async (id: string) => {
      said.length = 0;
      await scripts[id](api);
      return said.map((p) => `${p.who ?? ''}: ${p.text}`).join(' ');
    };
    const shots: unknown[] = [];
    api.shot = (...a) => void shots.push(a);
    restore(state);
    expect(area.shield.present).toBe(true);

    // Before the scare: everyone has something to say about Wren being out, and nobody hands over anything.
    expect(await talk('npc.maren')).toMatch(/past the fence/);
    expect(state.keys).toBe(0);
    expect(state.has('gotGroveKey')).toBe(false);
    expect(await talk('npc.tobin')).toMatch(/Daft, but bold/);
    expect(await talk('npc.lark')).toMatch(/north fence/);
    expect(await talk('npc.odo')).toMatch(/So this is Wren/);

    // The shield: guard taught, then a scream and one line, with no camera work.
    const screams: number[] = [];
    (api as { sfx: unknown }).sfx = new Proxy({}, { get: (_, k) => (k === 'scream' ? () => void screams.push(1) : () => {}) });
    const pickup = await talk('pickup.shield');
    expect(state.has('hasShield')).toBe(true);
    expect(area.shield.present).toBe(false);
    expect(pickup).toContain('guard');
    expect(pickup).toContain('Ahh!!!');
    expect(state.has('village.scare')).toBe(true);
    expect(screams).toHaveLength(1);
    expect(shots).toHaveLength(0);

    // Afterwards the talk turns to what came over the fence; shaken, Maren hands over the key.
    expect(await talk('npc.tobin')).toMatch(/Tall, or wide/);
    expect(await talk('npc.lark')).toMatch(/Told you it was real/);
    expect(await talk('npc.maren')).toContain('bucket');
    expect(state.keys).toBe(1);
    expect(state.has('gotGroveKey')).toBe(true);
    // A reload keeps the shield taken.
    const again = new Overworld(physics);
    overworldContent(again).restore(state);
    expect(again.shield.present).toBe(false);
    again.dispose();
    area.dispose();
  });

  it('Odo greets Wren as a stranger only before the scare', async () => {
    const area = new Overworld(physics);
    const first = async (setup: (st: GameState) => void) => {
      const st = new GameState();
      setup(st);
      const { api, said } = fakeApi(area, physics, st);
      await overworldContent(area).scripts['npc.odo'](api);
      return said[0]?.text ?? '';
    };
    expect(await first(() => {})).toMatch(/So this is Wren/);
    expect(await first((st) => st.set('village.scare'))).not.toMatch(/So this is Wren/);
    area.dispose();
  });

  it('when the ward breaks, the grown-ups vanish: the kids stay, Pip asks once, the stall and the mill stay open', async () => {
    const area = new Overworld(physics);
    const st = new GameState();
    st.set('hasSword');
    st.set('hasShield');
    st.set('village.surfIdea');
    st.set('village.surfTried');
    const { api, said, asked, answers } = fakeApi(area, physics, st);
    const { scripts, restore } = overworldContent(area);
    const talk = async (id: string) => {
      said.length = 0;
      await scripts[id](api);
      return said.map((p) => p.text).join(' ');
    };
    const enabled = (id: string) => area.interactables.find((it) => it.id === id)!.enabled();
    restore(st);
    expect(['maren', 'tobin', 'odo'].every((v) => area.npcs[v as 'maren'].present)).toBe(true);
    expect(await talk('door.mill')).toContain('locked');

    st.set('valleyOpen');
    restore(st);
    for (const v of ['maren', 'tobin', 'odo'] as const) expect(area.npcs[v].present, v).toBe(false);
    expect(area.npcs.lark.present && area.npcs.pip.present).toBe(true);
    expect(enabled('npc.maren') || enabled('npc.tobin')).toBe(false);
    expect(enabled('npc.odo')).toBe(true);
    expect(area.interactables.find((it) => it.id === 'npc.odo')!.label).toBe('Browse');

    // Lark tells it and points at Pip; Pip asks, once; then their usual talk misses the grown-ups.
    expect(await talk('npc.lark')).toMatch(/nobody's here.*Pip wants to ask you/);
    expect(st.has('village.searchAsked')).toBe(false);
    expect(await talk('npc.pip')).toContain('look for them');
    expect(st.has('village.searchAsked')).toBe(true);
    st.hours = 12;
    expect(await talk('npc.pip')).not.toContain('look for them');
    expect(await talk('npc.lark')).toContain('What if they come back');

    // The mill opens without Tobin's key.
    area.millDoor.setOpen(false);
    await talk('door.mill');
    expect(area.millDoor.open).toBe(true);

    // Odo's stall: same wares, nobody behind the counter.
    st.gems = 100;
    st.flasks.add('life');
    st.flasks.drink(0);
    answers.push(1); // the first potion, after the tunic
    expect(await talk('npc.odo')).toContain('leave 20 gems in the cashbox');
    expect(asked.at(-1)!.pages[0].text).toContain('You leave the gems in his cashbox');
    expect(asked.at(-1)!.pages.some((p) => p.who)).toBe(false);
    expect(st.gems).toBe(80);
    answers.push(0);
    expect(await talk('npc.odo')).toContain('take the [gear]Stoneward Tunic[/]');
    expect(st.has('village.stonewardTunic')).toBe(true);
    expect(await talk('npc.odo')).toContain('nothing here you need');
    area.dispose();
  });

  it('the crossroads sign points one way: home', async () => {
    const area = new Overworld(physics);
    const { api, said } = fakeApi(area, physics);
    await overworldContent(area).scripts['sign.crossroads'](api);
    expect(said[0].text).toBe('← Thistledown Village');
    area.dispose();
  });

  it('villagers react to night and to Wren\'s gear', async () => {
    const area = new Overworld(physics);
    const line = async (id: string, setup: (st: GameState) => void) => {
      const st = new GameState();
      setup(st);
      const { api, said } = fakeApi(area, physics, st);
      await overworldContent(area).scripts[id](api);
      return said.map((p) => p.text).join(' ');
    };
    const armed = (st: GameState) => (st.set('gotGroveKey'), st.set('hasSword'));
    // Maren, armed: the night warning differs from the day advice.
    expect(await line('npc.maren', (st) => (armed(st), (st.hours = 22)))).toContain('exactly when he walks');
    expect(await line('npc.maren', (st) => (armed(st), (st.hours = 12)))).toContain('Go at night');
    // Odo notices the tunic, and the time of day.
    const tunic = (st: GameState) => st.set('village.stonewardTunic');
    expect(await line('npc.odo', (st) => (tunic(st), (st.hours = 22)))).toContain('lamplight');
    expect(await line('npc.odo', (st) => (tunic(st), (st.hours = 12)))).toContain('suits you');
    // Tobin after the Lamplighter falls.
    const done = (st: GameState) => st.set('lamplighterDefeated');
    expect(await line('npc.tobin', (st) => (done(st), (st.hours = 22)))).toContain('burning');
    expect(await line('npc.tobin', (st) => (done(st), (st.hours = 12)))).toContain('lit again');
    area.dispose();
  });

  it('Pip asks for her doll (always saying where), takes it back once for 20 gems, before any news', async () => {
    const area = new Overworld(physics);
    const st = new GameState();
    const { api, said } = fakeApi(area, physics, st);
    const { scripts } = overworldContent(area);
    const talk = async (id: string) => {
      said.length = 0;
      await scripts[id](api);
      return said.map((p) => p.text).join(' ');
    };
    // Before the sword she doesn't ask (Wren couldn't break the jar): she's only scared.
    st.hours = 12;
    expect(await talk('npc.pip')).toContain('thorns');
    st.hours = 22;
    expect(await talk('npc.pip')).not.toContain('Button');
    st.set('hasSword');
    st.hours = 12;
    expect(await talk('npc.pip')).toMatch(/sword now.*Glimmer Lake/);
    st.hours = 22;
    expect(await talk('npc.pip')).toMatch(/dark tonight.*Glimmer Lake/);
    st.set('valleyOpen');
    st.set('village.searchAsked');
    expect(await talk('npc.pip')).toMatch(/Everyone's away.*Glimmer Lake/);
    // Breaking the jar: she's named now Wren has met her.
    expect(await talk('jar.doll')).toContain('You found [gear]Button[/]');
    expect(st.has('village.dollFound')).toBe(true);
    // News waits: the doll goes back first, and only once.
    st.flags.delete('village.searchAsked');
    const gems = st.gems;
    expect(await talk('npc.pip')).toContain('Pip gives you *20 gems*');
    expect(st.gems).toBe(gems + 20);
    expect(await talk('npc.pip')).toContain('look for them'); // the news, now
    expect(await talk('npc.pip')).toContain('listening for the mill');
    st.hours = 12;
    expect(await talk('npc.pip')).toContain('Odo\'s stall');
    expect(st.gems).toBe(gems + 20);
    area.dispose();
  });

  it('finding the doll before meeting Pip doesn\'t name her', async () => {
    const area = new Overworld(physics);
    const { api, said } = fakeApi(area, physics, new GameState());
    await overworldContent(area).scripts['jar.doll'](api);
    expect(said[0].text).toContain('stuffed doll');
    area.dispose();
  });

  it('no one names kin: villagers are neighbors, not family', () => {
    const kin = /\b(mum|mom|mother|father|dad|papa|mama|grand\w*|sister|brother|aunt\w*|uncle|cousin|son|daughter|husband|wife|niece|nephew|parents?)\b/i;
    const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [f, text] of Object.entries(files)) {
      if (f.endsWith('.test.ts')) continue;
      const strings = text.match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
      for (const str of strings) expect(str, f).not.toMatch(kin);
    }
  });

  it('opens the shrine door by interacting with it once the lantern is relit', async () => {
    const area = new Overworld(physics);
    const { api, state } = fakeApi(area, physics);
    state.set('hasSword');
    state.set('lamplighterDefeated');
    const content = overworldContent(area);
    content.restore(state);
    expect(area.door.awake).toBe(true);
    await content.scripts['door.shrine'](api);
    expect(area.door.opening).toBe(true);
    expect(state.has('shrineOpen')).toBe(true);
    // Walking in through the open door takes Wren into the dungeon.
    const { api: api2, travels } = fakeApi(area, physics, state);
    await content.scripts['trigger.shrineEntrance'](api2);
    expect(travels).toEqual([{ area: 'shrine', entrance: undefined }]);
    area.dispose();
  });

  it('still hands over the key on a save from before keys existed (met Maren, no key)', async () => {
    const area = new Overworld(physics);
    const state = new GameState();
    state.set('metMaren');
    const { api } = fakeApi(area, physics, state);
    await overworldContent(area).scripts['npc.maren'](api);
    expect(state.keys).toBe(1);
    expect(state.has('gotGroveKey')).toBe(true);
    area.dispose();
  });

  it('does not start the Lamplighter fight without a sword', async () => {
    const area = new Overworld(physics);
    const { api } = fakeApi(area, physics);
    area.hollow.armed = true;
    await overworldContent(area).scripts['trigger.hollow'](api);
    expect(area.hollow.sealed).toBe(false);
    area.dispose();
  });

  it('the Lamplighter\'s entrance plays in silence; its song starts with the fight', async () => {
    const area = new Overworld(physics);
    const state = new GameState();
    state.set('hasSword');
    state.hours = 21;
    const { api, enemies } = fakeApi(area, physics, state);
    const content = overworldContent(area);
    content.start?.(api);
    const boss = enemies.find((e) => 'engaged' in e) as unknown as { engaged: boolean };
    expect(boss).toBeTruthy();
    const calls: { on: boolean; fighting: boolean }[] = [];
    api.silenceMusic = (on) => void calls.push({ on, fighting: boss.engaged });
    await content.scripts['trigger.hollow'](api);
    expect(calls).toEqual([{ on: true, fighting: false }, { on: false, fighting: true }]);
    area.dispose();
  });

  it('restores opened things from a save', () => {
    const fresh = new Overworld(physics);
    const state = new GameState();
    state.set('groveChestOpened');
    state.set('shrineOpen');
    overworldContent(fresh).restore(state);
    expect(fresh.chest.opened).toBe(true);
    expect(fresh.door.open).toBe(true);
    expect(fresh.door.awake).toBe(false); // the lantern isn't lit in this save
    fresh.dispose();
  });

  it('removes all of its colliders when disposed', () => {
    const p = new Physics();
    const area = new Overworld(p);
    expect(p.world.colliders.len()).toBeGreaterThan(500);
    area.dispose();
    expect(p.world.colliders.len()).toBe(0);
  });
});
