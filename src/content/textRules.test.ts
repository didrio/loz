import { describe, expect, it } from 'vitest';
import { highlightCount, tagProblems, visibleText } from '../ui/richText';

/**
 * The text rules (docs/world.md, "Writing for the player"), checked on every string literal in content/
 * and on the sign texts in the dungeon data: valid tags, at most 2 highlights a box, at most MAX_CHARS
 * visible characters a box.
 */
const MAX_CHARS = 120;
const MAX_HIGHLIGHTS = 2;

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
/** Dungeon data holds its signs' words (`text:` on a sign thing): only those are player text there. */
const defs = import.meta.glob('../world/dungeon/defs/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const signTexts = (src: string) => strings([...src.matchAll(/\btext:\s*('(?:[^'\\\n]|\\.)*')/g)].map((m) => m[1]).join('\n'));
const tagged = (s: string) => /\[(\/|gear|place|danger|old|key|soft|shake|fade)\]/.test(s);
const looksLikeText = (s: string) => s.length > MAX_CHARS || tagged(s);

function checkBoxes(name: string, all: string[]) {
  it(`${name}: tags are valid and highlights are sparing`, () => {
    for (const s of all) {
      expect(tagProblems(s), s).toEqual([]);
      expect(highlightCount(s), s).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
    }
  });

  it(`${name}: boxes stay short`, () => {
    // A box is one page; "\n" inside a page is a line break, so the whole string counts.
    const long = all.filter((s) => !/^[a-z]+(\.[\w-]+)+$/.test(s) && visibleText(s).length > MAX_CHARS);
    expect(long, `${name} has long boxes`).toEqual([]);
  });
}

describe('text rules', () => {
  for (const f of files) checkBoxes(f, strings(sources[`./${f}`]).filter(looksLikeText));

  for (const [path, src] of Object.entries(defs)) {
    const name = path.split('/').pop()!;
    checkBoxes(`dungeon ${name}`, signTexts(src));
  }

  it('finds the signs in the dungeon data', () => {
    expect(signTexts(defs['../world/dungeon/defs/shrine.ts'])).toContain('Here stand the shrine\'s keepers. Do not wake them.');
  });
});
