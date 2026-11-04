import { describe, expect, it } from 'vitest';
import { highlightCount, tagProblems, visibleText } from '../ui/richText';

/**
 * The text rules (docs/world.md, "Writing for the player"), checked on every string literal in content/:
 * valid tags, at most 2 highlights a box, at most MAX_CHARS visible characters a box.
 * Old text over the length limit is a ratchet: per file, the count of long boxes may only go down
 * (the text pass, chunks C3/C4, brings these to zero). New text must obey the limit.
 */
const MAX_CHARS = 120;
const MAX_HIGHLIGHTS = 2;
/** Boxes over MAX_CHARS that already existed when the rule began (2026-11-04). Only lower these. */
const LONG_ALLOWED: Record<string, number> = {
  'bells.ts': 2, 'gravelheart.ts': 2, 'hints.ts': 4, 'overworld.ts': 6, 'shrine.ts': 3, 'sigils.ts': 1, 'village.ts': 23, 'villageNews.ts': 2,
};

const sources = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(sources)
  .map((p) => p.slice(2))
  .filter((f) => !f.endsWith('.test.ts') && f !== 'fakeApi.ts');
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

function strings(src: string): string[] {
  const out: string[] = [];
  for (const m of src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    out.push(raw.replace(/\\n/g, '\n').replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, 'xxxxx'));
  }
  return out;
}
const tagged = (s: string) => /\[(\/|gear|place|danger|old|key|soft|shake|fade)\]/.test(s);
const looksLikeText = (s: string) => s.length > MAX_CHARS || tagged(s);

describe('text rules', () => {
  for (const f of files) {
    const all = strings(sources[`./${f}`]).filter(looksLikeText);

    it(`${f}: tags are valid and highlights are sparing`, () => {
      for (const s of all) {
        expect(tagProblems(s), s).toEqual([]);
        expect(highlightCount(s), s).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
      }
    });

    it(`${f}: boxes stay short`, () => {
      // A box is one page; "\n" inside a page is a line break, so the whole string counts.
      const long = all.filter((s) => !/^[a-z]+(\.[\w-]+)+$/.test(s) && visibleText(s).length > MAX_CHARS);
      expect(long.length, `${f} has ${long.length} long boxes, e.g. "${long[0]?.slice(0, 60)}"`).toBeLessThanOrEqual(LONG_ALLOWED[f] ?? 0);
    });
  }
});
