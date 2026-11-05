/**
 * The speech sounds: one entry per ARPAbet phoneme with what the formant voice (`klatt.ts`) needs
 * to say it. Think of each entry as a synth patch: where the resonances sit (formants F1–F3 and
 * their bandwidths), which sources are on (voicing, breath, hiss) and how loud, and how long the
 * sound lasts before the timing rules stretch or squeeze it.
 *
 * Base values are Klatt's published tables (Klatt 1980, "Software for a cascade/parallel formant
 * synthesizer", Table III; durations from Klatt 1979 as used in MITalk, Allen, Hunnicutt & Klatt
 * 1987), adjusted where measurement on this synth called for it. Amplitudes are in Klatt-style dB:
 * 60 is a full vowel, every 6 dB halves or doubles, 0 means off.
 */
import type { Phoneme } from './types';

export type Manner = 'vowel' | 'diphthong' | 'stop' | 'affricate' | 'fricative' | 'nasal' | 'liquid' | 'glide' | 'aspirate';
export type Place = 'labial' | 'labiodental' | 'dental' | 'alveolar' | 'palatal' | 'velar' | 'glottal' | 'vocalic';

/** Formant frequencies and bandwidths in Hz, for an adult male tract (`tractScale` 1). */
export interface Formants {
  f1: number;
  f2: number;
  f3: number;
  b1: number;
  b2: number;
  b3: number;
}

/** The parallel branch's gains in dB (0 = off): the frication spectrum's peaks at F2–F6, and AB, the flat bypass. */
export interface Parallel {
  a2: number;
  a3: number;
  a4: number;
  a5: number;
  a6: number;
  ab: number;
}

export interface PhonemeSpec {
  manner: Manner;
  place: Place;
  voiced: boolean;
  /** The steady target (the onset target for a diphthong). */
  target: Formants;
  /** Where the formants glide to by the end of the sound (diphthongs, and the slight glide of Klatt's tense vowels). */
  glide?: Formants;
  /** Voicing amplitude (dB) while the sound is held; for a stop, during its release (the closure is silent or a voice bar). */
  av: number;
  /** Aspiration (breath noise through the vocal tract), dB. */
  ah: number;
  /** Frication (hiss through the parallel branch), dB. */
  af: number;
  par: Parallel;
  /** A stop's or affricate's release burst: frication level and spectrum, length in s. */
  burst?: { af: number; par: Parallel; dur: number };
  /** Klatt 1979's inherent (longest usual) and minimum durations, ms. */
  inherent: number;
  min: number;
}

const F = (f1: number, f2: number, f3: number, b1: number, b2: number, b3: number): Formants => ({ f1, f2, f3, b1, b2, b3 });
const P = (a2: number, a3: number, a4: number, a5: number, a6: number, ab: number): Parallel => ({ a2, a3, a4, a5, a6, ab });
const NOPAR = P(0, 0, 0, 0, 0, 0);

const vowel = (target: Formants, inherent: number, min: number, glide?: Formants, manner: Manner = 'vowel'): PhonemeSpec => ({
  manner,
  place: 'vocalic',
  voiced: true,
  target,
  glide,
  av: 60,
  ah: 0,
  af: 0,
  par: NOPAR,
  inherent,
  min,
});

const sonorant = (manner: Manner, place: Place, target: Formants, av: number, inherent: number, min: number): PhonemeSpec => ({
  manner,
  place,
  voiced: true,
  target,
  av,
  ah: 0,
  af: 0,
  par: NOPAR,
  inherent,
  min,
});

const fricative = (place: Place, voiced: boolean, target: Formants, af: number, par: Parallel, inherent: number, min: number): PhonemeSpec => ({
  manner: 'fricative',
  place,
  voiced,
  target,
  av: voiced ? 50 : 0,
  ah: 0,
  af,
  par,
  inherent,
  min,
});

const stop = (place: Place, voiced: boolean, target: Formants, burst: Parallel, burstAf: number, burstDur: number, inherent: number, min: number): PhonemeSpec => ({
  manner: 'stop',
  place,
  voiced,
  target,
  av: voiced ? 60 : 0,
  ah: 0,
  af: 0,
  par: NOPAR,
  burst: { af: burstAf, par: burst, dur: burstDur },
  inherent,
  min,
});

/** The hush of SH, shared by the affricates' frication. */
const SH_PAR = P(0, 60, 50, 48, 46, 0);

export const PHONEMES: Record<Phoneme, PhonemeSpec> = {
  // Vowels (Klatt 1980 targets; the tense ones glide a little, as he wrote them).
  IY: vowel(F(310, 2020, 2960, 45, 110, 250), 155, 55, F(290, 2070, 2960, 60, 110, 250)),
  IH: vowel(F(400, 1800, 2570, 50, 100, 140), 135, 40, F(470, 1600, 2600, 50, 100, 140)),
  EH: vowel(F(530, 1680, 2500, 60, 90, 200), 150, 70, F(620, 1530, 2530, 60, 90, 200)),
  AE: vowel(F(620, 1660, 2430, 70, 150, 320), 230, 80, F(650, 1490, 2470, 70, 100, 320)),
  AA: vowel(F(700, 1220, 2600, 130, 70, 160), 240, 100),
  AO: vowel(F(600, 990, 2570, 90, 100, 80), 240, 100, F(630, 1040, 2600, 90, 100, 80)),
  AH: vowel(F(620, 1220, 2550, 80, 50, 140), 140, 60),
  UH: vowel(F(450, 1100, 2350, 80, 100, 80), 160, 60, F(500, 1180, 2390, 80, 100, 80)),
  UW: vowel(F(350, 1250, 2200, 65, 110, 140), 210, 70, F(320, 900, 2200, 65, 110, 140)),
  ER: vowel(F(470, 1270, 1540, 100, 60, 110), 180, 80, F(420, 1310, 1540, 100, 60, 110)),
  // Diphthongs: the glide is the sound.
  EY: vowel(F(480, 1720, 2520, 70, 100, 200), 190, 100, F(330, 2020, 2600, 55, 100, 200), 'diphthong'),
  OW: vowel(F(540, 1100, 2300, 80, 70, 70), 220, 80, F(450, 900, 2300, 80, 70, 70), 'diphthong'),
  AY: vowel(F(660, 1200, 2550, 100, 70, 200), 250, 150, F(400, 1880, 2500, 70, 100, 200), 'diphthong'),
  AW: vowel(F(640, 1230, 2550, 80, 70, 140), 260, 100, F(420, 940, 2350, 80, 70, 80), 'diphthong'),
  OY: vowel(F(550, 960, 2400, 80, 50, 130), 280, 150, F(360, 1820, 2450, 60, 50, 160), 'diphthong'),

  // Glides and liquids: voiced, a little quieter than a vowel, mostly transition.
  W: sonorant('glide', 'labial', F(290, 610, 2150, 50, 80, 60), 56, 80, 60),
  Y: sonorant('glide', 'palatal', F(260, 2070, 3020, 40, 150, 300), 56, 80, 40),
  R: sonorant('liquid', 'alveolar', F(310, 1060, 1380, 70, 100, 120), 56, 80, 30),
  L: sonorant('liquid', 'alveolar', F(310, 1050, 2880, 50, 100, 280), 55, 80, 40),

  // Nasals: the murmur. The nasal pole/zero pair is set by the synth (FNP 270, FNZ 450 here).
  M: sonorant('nasal', 'labial', F(480, 1270, 2130, 40, 200, 200), 54, 70, 60),
  N: sonorant('nasal', 'alveolar', F(480, 1340, 2470, 40, 300, 300), 54, 60, 50),
  NG: sonorant('nasal', 'velar', F(480, 2000, 2900, 160, 150, 400), 54, 95, 80),

  // Fricatives.
  F: fricative('labiodental', false, F(340, 1100, 2080, 200, 120, 150), 60, P(0, 0, 0, 0, 0, 57), 100, 80),
  V: fricative('labiodental', true, F(220, 1100, 2080, 60, 90, 120), 60, P(0, 0, 0, 0, 0, 52), 60, 40),
  TH: fricative('dental', false, F(320, 1290, 2540, 200, 90, 200), 60, P(0, 0, 0, 0, 28, 52), 90, 60),
  DH: fricative('dental', true, F(270, 1290, 2540, 60, 80, 170), 60, P(0, 0, 0, 0, 27, 48), 50, 30),
  S: fricative('alveolar', false, F(320, 1390, 2530, 200, 80, 200), 60, P(0, 0, 0, 0, 55, 0), 105, 60),
  Z: fricative('alveolar', true, F(240, 1390, 2530, 70, 60, 180), 60, P(0, 0, 0, 0, 52, 0), 75, 40),
  SH: fricative('palatal', false, F(300, 1840, 2750, 200, 100, 300), 60, SH_PAR, 105, 80),
  ZH: fricative('palatal', true, F(300, 1840, 2750, 70, 60, 280), 60, SH_PAR, 70, 40),
  HH: { manner: 'aspirate', place: 'glottal', voiced: false, target: F(500, 1500, 2500, 300, 200, 300), av: 0, ah: 57, af: 0, par: NOPAR, inherent: 80, min: 20 },

  // Stops: a closure (silent, or a low voice bar), then a burst shaped by the place of the tongue.
  P: stop('labial', false, F(400, 1100, 2150, 300, 150, 220), P(0, 0, 0, 0, 0, 63), 60, 0.006, 90, 50),
  B: stop('labial', true, F(200, 1100, 2150, 60, 110, 130), P(0, 0, 0, 0, 0, 63), 54, 0.005, 85, 60),
  T: stop('alveolar', false, F(400, 1600, 2600, 300, 120, 250), P(0, 30, 40, 48, 54, 0), 60, 0.012, 75, 50),
  D: stop('alveolar', true, F(200, 1600, 2600, 60, 100, 170), P(0, 44, 50, 52, 50, 0), 54, 0.01, 75, 50),
  K: stop('velar', false, F(300, 1990, 2850, 250, 160, 330), P(0, 53, 43, 45, 45, 0), 60, 0.018, 80, 60),
  G: stop('velar', true, F(200, 1990, 2850, 60, 150, 280), P(0, 58, 46, 45, 45, 0), 54, 0.014, 80, 60),
  // Affricates: a stop closure released into an SH. Klatt's 70 ms covers the frication; the closure is added on top.
  CH: { ...stop('palatal', false, F(350, 1800, 2820, 200, 90, 300), SH_PAR, 60, 0.008, 130, 70), manner: 'affricate', af: 60, par: SH_PAR },
  JH: { ...stop('palatal', true, F(260, 1800, 2820, 60, 80, 270), SH_PAR, 56, 0.008, 110, 60), manner: 'affricate', av: 50, af: 56, par: SH_PAR },
};

/** Schwa: what an unstressed AH (CMUdict's AH0) is, and where unstressed vowels drift toward. */
export const SCHWA: Formants = F(500, 1400, 2300, 80, 60, 140);

/** The nasal tract's pole and zero: equal (they cancel) except during a nasal's murmur. */
export const NASAL_REST = { fnp: 250, bnp: 100, fnz: 250, bnz: 100 };
export const NASAL_MURMUR = { fnp: 270, bnp: 100, fnz: 450, bnz: 100 };

/** F4–F6 don't move between sounds (Klatt's defaults); the tract scale still applies. */
export const HIGH_FORMANTS = { f4: 3300, b4: 250, f5: 3750, b5: 200, f6: 4900, b6: 1000 };

/**
 * Locus rules for consonant–vowel transitions: at the boundary the formant sits at
 * `locus + k × (vowel − locus)` (Klatt's "locus + percentage" rule; the values are fitted to
 * Sussman's locus equations). k near 1 lets the vowel dominate (lips: the tongue is free);
 * small k pins the onset near the consonant's own place (the tongue tip for T, D, N, S).
 */
export const LOCI: Partial<Record<Place, { f1: [number, number]; f2: [number, number]; f3: [number, number] }>> = {
  labial: { f1: [250, 0.35], f2: [1000, 0.8], f3: [2100, 0.7] },
  labiodental: { f1: [250, 0.4], f2: [1100, 0.75], f3: [2150, 0.7] },
  dental: { f1: [270, 0.4], f2: [1600, 0.5], f3: [2600, 0.6] },
  alveolar: { f1: [250, 0.35], f2: [1830, 0.4], f3: [2700, 0.5] },
  palatal: { f1: [270, 0.4], f2: [2200, 0.5], f3: [2800, 0.5] },
  velar: { f1: [250, 0.35], f2: [2400, 0.75], f3: [2300, 0.7] },
};

export const spec = (p: Phoneme): PhonemeSpec => PHONEMES[p];
export const isObstruent = (s: PhonemeSpec) => s.manner === 'stop' || s.manner === 'affricate' || s.manner === 'fricative';
export const isSyllabic = (s: PhonemeSpec) => s.manner === 'vowel' || s.manner === 'diphthong';
export const isSonorantConsonant = (s: PhonemeSpec) => s.manner === 'liquid' || s.manner === 'glide' || s.manner === 'nasal';
export const isStopLike = (s: PhonemeSpec) => s.manner === 'stop' || s.manner === 'affricate';

/** Klatt's rule 9 classes: what follows a vowel changes how long it is. */
export type PostVocalic = 'voicedFricative' | 'voicedPlosive' | 'nasal' | 'voicelessPlosive' | 'other';
export function postVocalicClass(s: PhonemeSpec): PostVocalic {
  if (s.manner === 'nasal') return 'nasal';
  if (s.manner === 'fricative') return s.voiced ? 'voicedFricative' : 'other';
  if (s.manner === 'stop' || s.manner === 'affricate') return s.voiced ? 'voicedPlosive' : 'voicelessPlosive';
  return 'other';
}

/** Vowels whose tongue is high get a slightly higher pitch (intrinsic F0), low ones a slightly lower one, in semitones. */
export const INTRINSIC_F0: Partial<Record<Phoneme, number>> = { IY: 0.4, IH: 0.25, UW: 0.4, UH: 0.25, AA: -0.3, AE: -0.25, AO: -0.25 };
