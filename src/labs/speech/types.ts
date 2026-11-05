/**
 * The contract between the speech pipeline's halves: `phonemize` (text → words and phonemes) and
 * `prosody` + `klatt` (phonemes → timed sound). Phonemes are ARPAbet (CMUdict's symbols) without
 * stress digits; stress lives on the syllable.
 */

/** ARPAbet vowels (15) and consonants (24), as CMUdict writes them. */
export const VOWELS = ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'] as const;
export const CONSONANTS = [
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
] as const;
export type Vowel = (typeof VOWELS)[number];
export type Consonant = (typeof CONSONANTS)[number];
export type Phoneme = Vowel | Consonant;

export const isVowel = (p: string): p is Vowel => (VOWELS as readonly string[]).includes(p);
export const isPhoneme = (p: string): p is Phoneme => isVowel(p) || (CONSONANTS as readonly string[]).includes(p);

/** 0 unstressed, 1 primary, 2 secondary (CMUdict's digits). */
export type Stress = 0 | 1 | 2;

export interface Syllable {
  phonemes: Phoneme[];
  stress: Stress;
}

export interface SpokenWord {
  /** The word as written (lowercase, no punctuation), for the debug readout and for typing text along. */
  text: string;
  syllables: Syllable[];
  /** Function words (the, a, of, and, to, is...) get no pitch accent and are shortened. */
  content: boolean;
  /** Character range of the word in the original (tag-stripped) text: [start, end). */
  span: [number, number];
}

/**
 * How a phrase ends, from its punctuation: a statement falls, a yes/no question rises,
 * a wh-question falls, a comma or dash continues (a small rise), an exclamation falls from higher.
 */
export type PhraseEnd = 'statement' | 'question' | 'whQuestion' | 'continue' | 'exclaim';

export interface Phrase {
  words: SpokenWord[];
  end: PhraseEnd;
  /** The pause after it, in ms, before delivery scaling (e.g. comma ~180, full stop ~420). */
  pauseMs: number;
}
