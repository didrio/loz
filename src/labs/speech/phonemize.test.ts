import { describe, expect, it } from 'vitest';
import { letterToSound } from './letters';
import { lookup, phonemize, syllabify } from './phonemize';
import { isPhoneme } from './types';

const sources = import.meta.glob('../../content/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const defs = import.meta.glob('../../world/dungeon/defs/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

function strings(src: string): string[] {
  const out: string[] = [];
  for (const m of src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    out.push(raw.replace(/\\n/g, '\n').replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, ' '));
  }
  return out;
}

/** Strings a player reads: sentences and tagged text (not ids, flags or file-ish literals). */
function playerText(): string[] {
  const all: string[] = [];
  for (const [path, src] of Object.entries(sources)) {
    if (path.endsWith('.test.ts') || path.endsWith('fakeApi.ts')) continue;
    all.push(...strings(src));
  }
  for (const src of Object.values(defs)) {
    all.push(...strings([...src.matchAll(/\btext:\s*('(?:[^'\\\n]|\\.)*')/g)].map((m) => m[1]).join('\n')));
  }
  return all.filter((s) => /\[(\/|gear|place|danger|old|key|soft|shake|fade)\]/.test(s) || /\s/.test(s.trim()) && /[A-Za-z]{2}/.test(s) && !/^[\w-]+(\.[\w-]+)+$/.test(s));
}

const phones = (w: string) => syllabify(lookup(w).phones).map((s) => s.phonemes.join(' '));

describe('pronunciation coverage', () => {
  it('every word in player text is in names or the lexicon, not the rules', () => {
    const missing = new Set<string>();
    for (const s of playerText()) {
      for (const p of phonemize(s)) {
        for (const w of p.words) if (lookup(w.text).source === 'rules') missing.add(w.text);
      }
    }
    expect([...missing].sort(), 'words needing names.ts entries').toEqual([]);
  });
});

describe('lookup', () => {
  it('names win and report their source', () => {
    expect(lookup('Morrowbell').source).toBe('names');
    expect(lookup('the').source).toBe('lexicon');
    expect(lookup('zzxqv').source).toBe('rules');
  });
  it('derives possessives from the base word', () => {
    expect(lookup("Bram's")).toEqual({ phones: 'B R AE1 M Z', source: 'names' });
  });
  it('though, tough, bough and thought differ', () => {
    const set = new Set(['though', 'tough', 'bough', 'thought'].map((w) => lookup(w).phones));
    expect(set.size).toBe(4);
    expect(lookup('though').phones).toBe('DH OW1');
    expect(lookup('tough').phones).toBe('T AH1 F');
  });
});

describe('syllabify', () => {
  it('lantern: L AE1 N | T ER0 N', () => {
    const s = syllabify(lookup('lantern').phones);
    expect(s.map((x) => x.phonemes.join(' '))).toEqual(['L AE N', 'T ER N']);
    expect(s.map((x) => x.stress)).toEqual([1, 0]);
  });
  it('quietly has three syllables', () => expect(phones('quietly')).toHaveLength(3));
  it('nothing: N AH1 | TH IH0 NG (maximal onset keeps NG as coda)', () => {
    expect(phones('nothing')).toEqual(['N AH', 'TH IH NG']);
  });
  it('splits a cluster by legal onsets', () => {
    expect(syllabify('AH0 S T R EY1 NG JH').map((s) => s.phonemes.join(' '))).toEqual(['AH', 'S T R EY NG JH']);
    expect(syllabify('W IH1 N D OW0').map((x) => x.phonemes.join(' '))).toEqual(['W IH N', 'D OW']);
  });
  it('keeps a vowelless word whole', () => {
    expect(syllabify('P S T')).toEqual([{ phonemes: ['P', 'S', 'T'], stress: 0 }]);
  });
});

describe('phonemize', () => {
  it('ends phrases by punctuation', () => {
    expect(phonemize('Could you fetch Button?').map((p) => p.end)).toEqual(['question']);
    expect(phonemize('Where is she?').map((p) => p.end)).toEqual(['whQuestion']);
    expect(phonemize('Stop!').map((p) => p.end)).toEqual(['exclaim']);
    expect(phonemize('It is late.').map((p) => p.end)).toEqual(['statement']);
    expect(phonemize('It is late').map((p) => p.end)).toEqual(['statement']);
  });
  it('splits at commas and dashes into continue phrases', () => {
    const ph = phonemize('Well, I think so; maybe. Go on - quickly!');
    expect(ph.map((p) => p.end)).toEqual(['continue', 'continue', 'statement', 'continue', 'exclaim']);
    expect(ph[0].pauseMs).toBeLessThan(ph[2].pauseMs);
    expect(ph[0].words.map((w) => w.text)).toEqual(['well']);
  });
  it('treats an ellipsis as a long continue', () => {
    const ph = phonemize('Well... maybe.');
    expect(ph[0].end).toBe('continue');
    expect(ph[0].pauseMs).toBeGreaterThanOrEqual(500);
    expect(phonemize('Well…')[0].pauseMs).toBeGreaterThanOrEqual(500);
  });
  it('strips tags and records spans in the stripped text', () => {
    const text = 'Take the [gear]lantern[/], Wren. Press [shield].';
    const ph = phonemize(text);
    const plain = 'Take the lantern, Wren. Press #.';
    for (const p of ph) for (const w of p.words) expect(plain.slice(...w.span).toLowerCase()).toBe(w.text);
    expect(ph.flatMap((p) => p.words.map((w) => w.text))).toEqual(['take', 'the', 'lantern', 'wren', 'press']);
  });
  it('spans match with curly quotes', () => {
    const text = 'It’s Wren’s “friend”.';
    const w = phonemize(text).flatMap((p) => p.words);
    expect(w.map((x) => text.slice(...x.span).toLowerCase())).toEqual(['it\u2019s', 'wren\u2019s', 'friend']);
    expect(w[0].text).toBe("it's");
  });
  it('marks function words', () => {
    const w = phonemize('The lantern of the old keeper').flatMap((p) => p.words);
    expect(w.map((x) => x.content)).toEqual([false, true, false, false, true, true]);
  });
  it('expands numbers and abbreviations', () => {
    const words = (t: string) => phonemize(t).flatMap((p) => p.words.map((w) => w.text));
    expect(words('Bring 20 gems')).toEqual(['bring', 'twenty', 'gems']);
    expect(words('I have 125')).toEqual(['i', 'have', 'one', 'hundred', 'twenty', 'five']);
    expect(words('Mr. Odo has 3 keys.')).toEqual(['mister', 'odo', 'has', 'three', 'keys']);
    expect(phonemize('Mr. Odo has 3 keys.')).toHaveLength(1);
    expect(words('the 2nd door')).toEqual(['the', 'second', 'door']);
    expect(words('50%')).toEqual(['fifty', 'percent']);
  });
  it('gives every word syllables of legal phonemes', () => {
    for (const p of phonemize("Don't you dare, Thistledown's Odo!"))
      for (const w of p.words) {
        expect(w.syllables.length).toBeGreaterThan(0);
        for (const s of w.syllables) for (const ph of s.phonemes) expect(isPhoneme(ph)).toBe(true);
      }
  });
  it('returns nothing for empty text', () => {
    expect(phonemize('')).toEqual([]);
    expect(phonemize('  ...  ')).toEqual([]);
  });
});

describe('letterToSound', () => {
  it('gives plausible output for invented words', () => {
    expect(letterToSound('blorp')).toMatch(/^B L AO1 R P$/);
    expect(letterToSound('cat')).toBe('K AE1 T');
    expect(letterToSound('ship')).toBe('SH IH1 P');
    expect(letterToSound('stoke').split(' ')).toEqual(['S', 'T', 'OW1', 'K']);
    expect(letterToSound('fenwick')).toMatch(/^F EH1 N W IH\d K$/);
  });
  it('never throws and only emits legal phonemes', () => {
    const inputs = ['', ' ', '123', "'", 'a', 'zzzzzz', 'qqq', 'xyzzy', 'aeiou', 'rhythm', 'ÿ!?', 'a'.repeat(200), '日本語', 'psst', "o'clock", 'strengths'];
    for (const i of inputs) {
      let out = '';
      expect(() => { out = letterToSound(i); }).not.toThrow();
      for (const t of out.split(' ').filter(Boolean)) expect(isPhoneme(t.replace(/\d$/, '')), `${i} → ${out}`).toBe(true);
    }
  });
  it('has exactly one primary stress in a word with vowels', () => {
    const out = letterToSound('wandering').split(' ').filter((t) => t.endsWith('1'));
    expect(out).toHaveLength(1);
  });
});
