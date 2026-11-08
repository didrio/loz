import { describe, expect, it } from 'vitest';
import { cornerView } from './corner';

describe('cornerView', () => {
  it('shows the dial and the time outdoors and in houses (no portrait)', () => {
    expect(cornerView('Thistledown Village', null)).toEqual({ picture: false, showTime: true, name: 'Thistledown Village' });
  });
  it('shows the dungeon picture and no time inside a dungeon', () => {
    expect(cornerView('The Waking Shrine', 'data:image/png;base64,x')).toEqual({ picture: true, showTime: false, name: 'The Waking Shrine' });
  });
  it('hides the name line when there is no place (the title screen)', () => {
    expect(cornerView('  ', null).name).toBe('');
  });
});
