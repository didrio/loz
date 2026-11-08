import { describe, expect, it } from 'vitest';
import { gearRows } from './gearRows';
import { GameState } from './state';

const icon = (id: string) => `icon:${id}`;
const labels = (s: GameState) => gearRows(s, icon).map((r) => r.label);

describe('the Gear tab', () => {
  it('is empty on a new game', () => {
    expect(gearRows(new GameState(), icon)).toEqual([]);
  });

  it('lists gear as it is found, each with its icon', () => {
    const s = new GameState();
    s.set('hasSword');
    s.set('hasShield');
    s.set('village.stonewardTunic');
    s.items.add('tether');
    s.flasks.add('life');
    s.bells.hung.add('morrow');
    s.bells.carried.add('way');
    const rows = gearRows(s, icon);
    expect(rows.map((r) => r.label)).toEqual(['Sword', 'Shield', 'Stoneward Tunic', 'Tether Glove', 'Life Potion', 'Waybell', 'Morrowbell']);
    expect(rows.map((r) => (r.kind === 'entry' ? r.icon : ''))).toEqual(['icon:gear-sword', 'icon:gear-shield', 'icon:gear-tunic', 'icon:gear-glove', 'icon:gear-flask-life', 'icon:gear-bell', 'icon:gear-bell']);
  });

  it('shows an emptied flask as empty, and Pip\'s doll only until she has it back', () => {
    const s = new GameState();
    s.flasks.add('attack');
    s.flasks.drink(0);
    s.set('village.dollFound');
    expect(labels(s)).toEqual(['Empty flask', 'Pip\'s doll']);
    s.set('village.dollReturned');
    expect(labels(s)).toEqual(['Empty flask']);
  });

  it('shows the keys of the dungeon Wren is in', () => {
    const s = new GameState();
    s.area = 'shrine';
    const d = s.dungeon('shrine');
    d.keys.add('jade');
    d.bossKey = true;
    expect(labels(s)).toEqual(['Jade key', 'Boss key']);
  });
});
