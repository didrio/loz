import { describe, expect, it } from 'vitest';
import { snap } from '../render/palette';
import { themeVars, UI_LOOKS, type UiLookId } from './theme';

const ids = Object.keys(UI_LOOKS) as UiLookId[];

describe('the UI theme', () => {
  it('every look sets the same variables', () => {
    const keys = Object.keys(themeVars('bold')).sort();
    for (const id of ids) expect(Object.keys(themeVars(id)).sort(), id).toEqual(keys);
  });

  it('every colour is a palette swatch', () => {
    for (const id of ids) {
      for (const [name, value] of Object.entries(themeVars(id))) {
        for (const m of value.matchAll(/#([0-9a-f]{6})|rgba\((\d+), (\d+), (\d+)/g)) {
          const n = m[1] ? parseInt(m[1], 16) : (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4]);
          expect(snap(n), `${id} ${name}`).toBe(n);
        }
      }
    }
  });

  it('outlines the text only when the look has an outline', () => {
    expect(themeVars('restrained')['--ui-ink'].split('),').length).toBe(1);
    expect(themeVars('bold')['--ui-ink'].split(', ').length).toBeGreaterThan(8);
  });
});
