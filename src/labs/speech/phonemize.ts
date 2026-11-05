/**
 * Text → phrases of words and syllables. Lookup order: NAMES, LEXICON (CMUdict), letter-to-sound rules.
 * Spans index the tag-stripped text (the same characters the dialog box shows).
 */
import { letterToSound } from './letters';
import { LEXICON } from './lexicon';
import { NAMES } from './names';
import { isPhoneme, isVowel, type Phoneme, type Phrase, type PhraseEnd, type SpokenWord, type Stress, type Syllable } from './types';

export type PronSource = 'names' | 'lexicon' | 'rules';

const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);

function base(word: string): { phones: string; source: PronSource } | undefined {
  if (NAMES[word]) return { phones: NAMES[word], source: 'names' };
  if (LEXICON[word]) return { phones: LEXICON[word], source: 'lexicon' };
  return undefined;
}

/** Add a plural/possessive s to a known pronunciation. */
function withS(phones: string): string {
  const last = phones.split(' ').pop()!.replace(/\d/g, '');
  if (SIBILANT.has(last)) return `${phones} IH0 Z`;
  return `${phones} ${VOICELESS.has(last) ? 'S' : 'Z'}`;
}

/** How a word will be said, and where the pronunciation came from (for a debug readout). */
export function lookup(word: string): { phones: string; source: PronSource } {
  const w = word.toLowerCase().replace(/[‘’]/g, "'");
  const direct = base(w);
  if (direct) return direct;
  const poss = w.match(/^(.+?)'s?$/);
  const plural = w.match(/^(.+[^s'])s$/);
  const stem = poss ? poss[1] : plural ? plural[1] : undefined;
  if (stem) {
    const b = base(stem);
    if (b) return { phones: withS(b.phones), source: b.source };
  }
  return { phones: letterToSound(w), source: 'rules' };
}

// --- syllables ---

const ONSET2 = new Set([
  ...['P', 'B', 'K', 'G', 'F'].flatMap((a) => [`${a} L`, `${a} R`]),
  ...['T', 'D', 'TH', 'SH'].map((a) => `${a} R`),
  'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W', 'S F', 'S V', 'K W', 'G W', 'T W', 'D W', 'TH W', 'HH W',
  ...['P', 'B', 'K', 'G', 'F', 'V', 'M', 'HH', 'T', 'D', 'N', 'S', 'L', 'TH', 'Z'].map((a) => `${a} Y`),
]);
const ONSET3 = new Set(['S P R', 'S P L', 'S T R', 'S K R', 'S K W', 'S K L', 'S P Y', 'S T Y', 'S K Y']);

function legalOnset(c: string[]): boolean {
  if (c.length === 0) return true;
  if (c.length === 1) return c[0] !== 'NG';
  if (c.length === 2) return ONSET2.has(c.join(' '));
  if (c.length === 3) return ONSET3.has(c.join(' '));
  return false;
}

/** Split a CMUdict-style string ("L AE1 N T ER0 N") into syllables, maximal onset. */
export function syllabify(phones: string): Syllable[] {
  const toks = phones.split(/\s+/).filter(Boolean).map((t) => {
    const m = t.match(/^([A-Z]+)(\d)?$/);
    return m && isPhoneme(m[1]) ? { p: m[1] as Phoneme, s: (m[2] ? Number(m[2]) : 0) as Stress } : undefined;
  }).filter((t): t is { p: Phoneme; s: Stress } => !!t);
  const nuclei = toks.map((t, i) => (isVowel(t.p) ? i : -1)).filter((i) => i >= 0);
  if (nuclei.length === 0) return toks.length ? [{ phonemes: toks.map((t) => t.p), stress: 0 }] : [];
  const cuts: number[] = []; // start index of every syllable after the first
  for (let k = 1; k < nuclei.length; k++) {
    const from = nuclei[k - 1] + 1;
    const to = nuclei[k];
    let start = to; // onset begins here
    for (let j = to - 1; j >= from && legalOnset(toks.slice(j, to).map((t) => t.p)); j--) start = j;
    cuts.push(start);
  }
  const bounds = [0, ...cuts, toks.length];
  return nuclei.map((n, k) => ({
    phonemes: toks.slice(bounds[k], bounds[k + 1]).map((t) => t.p),
    stress: toks[n].s,
  }));
}

// --- function words ---

const FUNCTION_WORDS = new Set(`a an the of to in on at by for from with into onto upon over under about as than through
and or but nor so if because while though although that which who whom whose whether
i me my mine we us our you your he him his she her it its they them their
is am are was were be been being do does did have has had will would shall should can could may might must
there here this these those not no
i'm i'll i've i'd you're you'll you've you'd he's he'll he'd she's she'll she'd it's it'll we're we'll we've we'd they're they'll they've they'd
that's there's let's what's who's`.split(/\s+/));

const WH = new Set(['who', 'whom', 'whose', 'what', 'which', 'when', 'where', 'why', 'how']);

// --- numbers and abbreviations ---

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function numberWords(n: number): string[] {
  if (n < 20) return [ONES[n]];
  if (n < 100) return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
  if (n < 1000) return [ONES[Math.floor(n / 100)], 'hundred', ...(n % 100 ? numberWords(n % 100) : [])];
  if (n < 1_000_000) return [...numberWords(Math.floor(n / 1000)), 'thousand', ...(n % 1000 ? numberWords(n % 1000) : [])];
  return [];
}
/** "20" → ["twenty"]; "007" and very long numbers are read digit by digit. */
export function expandNumber(digits: string): string[] {
  const n = Number(digits);
  if (/^0\d/.test(digits) || digits.length > 6 || !Number.isFinite(n)) return [...digits].map((d) => ONES[Number(d)]);
  return numberWords(n);
}

const ABBREV: Record<string, string[]> = {
  mr: ['mister'], mrs: ['missus'], dr: ['doctor'], st: ['saint'], vs: ['versus'],
};

// --- the pipeline ---

const TAGS = new Set(['gear', 'place', 'danger', 'old', 'key', 'soft', 'shake', 'fade']);
/** Tags removed; button names (`[shield]`) become one `#`, as the dialog box shows them. */
function stripTags(text: string): string {
  return text.replace(/\[(\/|\w+)\]/g, (_m, n: string) => (n === '/' || TAGS.has(n) ? '' : '#'));
}

const TOKEN = /(\d+(?:st|nd|rd|th)\b)|(\d+(?:\.\d+)?)|([A-Za-z]+(?:'[A-Za-z]+)*)|(\.{2,}[.!?]*|[.!?]+|…+|,|;|:|—|–|\s-\s|%|&)/g;

interface Pending { words: SpokenWord[] }

function makeWord(text: string, span: [number, number]): SpokenWord {
  const syllables = syllabify(lookup(text).phones);
  return { text, syllables, content: !FUNCTION_WORDS.has(text), span };
}

function endOf(punct: string, first: SpokenWord | undefined): { end: PhraseEnd; pauseMs: number } {
  if (punct.includes('…') || /^\.{2,}$/.test(punct) || /^\.{2,}[.]*$/.test(punct)) return { end: 'continue', pauseMs: 500 };
  if (punct.includes('?')) return { end: first && WH.has(first.text) ? 'whQuestion' : 'question', pauseMs: 420 };
  if (punct.includes('!')) return { end: 'exclaim', pauseMs: 380 };
  if (punct.includes('.')) return { end: 'statement', pauseMs: 420 };
  if (punct === ',') return { end: 'continue', pauseMs: 180 };
  return { end: 'continue', pauseMs: 250 }; // ; : and dashes
}

/** Text (with rich-text tags) → phrases. */
export function phonemize(text: string): Phrase[] {
  const plain = stripTags(text).replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"');
  const phrases: Phrase[] = [];
  let cur: Pending = { words: [] };
  const close = (punct: string) => {
    if (cur.words.length === 0) {
      const last = phrases[phrases.length - 1];
      if (last && punct) last.pauseMs = Math.max(last.pauseMs, endOf(punct, undefined).pauseMs);
      return;
    }
    phrases.push({ words: cur.words, ...endOf(punct, cur.words[0]) });
    cur = { words: [] };
  };
  const tokens = [...plain.matchAll(TOKEN)];
  for (let t = 0; t < tokens.length; t++) {
    const m = tokens[t];
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    if (m[1]) {
      const n = parseInt(m[1], 10);
      const words = n <= 10 ? [ORDINAL[n]] : numberWords(n);
      for (const w of words) cur.words.push(makeWord(w, span));
    } else if (m[2]) {
      const [whole, frac] = m[2].split('.');
      for (const w of expandNumber(whole)) cur.words.push(makeWord(w, span));
      if (frac) for (const w of ['point', ...[...frac].map((d) => ONES[Number(d)])]) cur.words.push(makeWord(w, span));
    } else if (m[3]) {
      const lower = m[3].toLowerCase();
      const ab = ABBREV[lower];
      if (ab && tokens[t + 1]?.[4] === '.' && tokens[t + 1].index === span[1]) {
        for (const w of ab) cur.words.push(makeWord(w, [span[0], span[1] + 1]));
        t++; // the abbreviation's own period
      } else cur.words.push(makeWord(lower, span));
    } else if (m[4] === '%') cur.words.push(makeWord('percent', span));
    else if (m[4] === '&') cur.words.push(makeWord('and', span));
    else close(m[4].trim());
  }
  close('');
  const lastP = phrases[phrases.length - 1];
  if (lastP && !/[.!?…,;:\-—–]\s*["')\]]*\s*$/.test(plain)) {
    lastP.end = 'statement';
    lastP.pauseMs = 420;
  }
  return phrases;
}
