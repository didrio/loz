import { describe, expect, it } from 'vitest';
import { scan } from '../../scripts/flags.mjs';
import { FLAGS } from './state';

/**
 * Flags the scan can't see being set or read by name, each with the reason. Everything else in `FLAGS` must be
 * set somewhere (a `set('x')`, or listed in a save state) and read somewhere (a `has('x')`), in `src/`.
 */
const NOT_SEEN: Record<string, { setters?: string; readers?: string }> = {
  'hint.tunic': { setters: 'set through hintFlag(id) (content/hints.ts)', readers: 'read through hintFlag(id)' },
  'hint.flasks': { setters: 'set through hintFlag(id) (content/hints.ts)', readers: 'read through hintFlag(id)' },
  'hint.bells': { setters: 'set through hintFlag(id) (content/hints.ts)', readers: 'read through hintFlag(id)' },
  'hint.boss': { setters: 'set through hintFlag(id) (content/hints.ts)', readers: 'read through hintFlag(id)' },
  'village.marenSigil': { setters: 'built as `village.${villager}Sigil` in content/villageNews.ts', readers: 'same' },
  'village.tobinSigil': { setters: 'built as `village.${villager}Sigil` in content/villageNews.ts', readers: 'same' },
  'village.larkSigil': { setters: 'built as `village.${villager}Sigil` in content/villageNews.ts', readers: 'same' },
  'village.odoSigil': { setters: 'built as `village.${villager}Sigil` in content/villageNews.ts', readers: 'same' },
  'village.pipSigil': { setters: 'built as `village.${villager}Sigil` in content/villageNews.ts', readers: 'same' },
  'village.larkRelief': { readers: 'RELIEF table in content/villageNews.ts: state.has(relief.flag)' },
  'village.searchAsked': { readers: 'RELIEF table in content/villageNews.ts: state.has(relief.flag)' },
};

describe('quest flags', () => {
  const use = scan();

  it('the scan sees every flag in FLAGS', () => {
    expect(Object.keys(use).sort()).toEqual([...FLAGS].sort());
  });

  it('every flag is set somewhere and read somewhere (exceptions are listed, with a reason)', () => {
    const problems: string[] = [];
    for (const [name, u] of Object.entries(use)) {
      const skip = NOT_SEEN[name] ?? {};
      if (!u.sets.length && !u.lists.length && !skip.setters) problems.push(`${name}: nothing sets it`);
      if (!u.reads.length && !skip.readers) problems.push(`${name}: nothing reads it`);
    }
    expect(problems).toEqual([]);
  });

  it('exceptions are still needed (drop one the scan now sees)', () => {
    for (const [name, skip] of Object.entries(NOT_SEEN)) {
      const u = use[name];
      expect(u, `${name} is not in FLAGS`).toBeDefined();
      if (skip.setters) expect(u.sets.length + u.lists.length, `${name} is now seen being set`).toBe(0);
      if (skip.readers) expect(u.reads.length, `${name} is now seen being read`).toBe(0);
    }
  });
});
