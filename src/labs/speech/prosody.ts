/**
 * Prosody: the performance of a line. Takes the words as phonemes (`Phrase[]`, from
 * `phonemize`) and decides when each sound starts and how long it lasts (timing), what the pitch
 * does (melody) and how loud each syllable is (dynamics). The output `Timeline` is like a MIDI
 * clip for the formant voice in `klatt.ts`: segments are the notes, the F0 track is the pitch
 * bend lane, the amplitude envelope is the volume lane.
 *
 * Timing follows Klatt's 1979 duration rules (as in MITalk): every sound has an inherent and a
 * minimum length, and each rule squeezes the stretchable part by a percentage (unstressed,
 * not phrase-final, in a long word, in a consonant cluster...) or stretches it (phrase-final,
 * before a voiced consonant).
 *
 * Melody is in semitones relative to the voice's base pitch, in units of its range, so one
 * contour suits a child and an old man: a declining reference line per phrase, a rise-fall
 * accent on the stressed syllable of each content word (the first and the last strongest), a
 * tune at the phrase's end from its punctuation, and micro-prosody (pitch dips on voiced
 * consonants, rises after voiceless ones, high vowels a touch higher).
 */
import { clamp, smoothstep } from '../../core/math';
import { INTRINSIC_F0, PHONEMES, SCHWA, isObstruent, isStopLike, isSyllabic, postVocalicClass, type Formants, type PhonemeSpec } from './phonemes';
import { DELIVERIES, resolveVoice, type Delivery, type ResolvedVoice, type VoiceProfile } from './profile';
import type { Phoneme, Phrase, PhraseEnd, Stress } from './types';

export interface Segment {
  /** null = silence (a pause, the lead-in or the tail). */
  phoneme: Phoneme | null;
  /** The sound's targets after context rules (unstressed vowels reduced, HH colored by its vowel); null for silence. */
  spec: PhonemeSpec | null;
  start: number;
  dur: number;
  /** Effective stress (a function word's syllables count as unstressed). */
  stress: Stress;
  /** Global word index (across phrases), -1 for silence. */
  word: number;
  phrase: number;
  /** Whether the sound is in its phrase's last syllable. */
  phraseFinal: boolean;
  /** Stops and affricates: when the closure opens (s, absolute); undefined = unreleased (held into the next consonant). */
  release?: number;
  /** Burst strength 0–1 (weaker phrase-finally). */
  burstGain?: number;
  /** Voiceless stops: breath after the burst before voicing starts (voice onset time), s. */
  vot?: number;
  /** A voiced stop's closure carries a low voice bar (it's between voiced sounds). */
  voiceBar?: boolean;
  /** T or D between vowels, before an unstressed one: a quick tap ("water", "little"). */
  flap?: boolean;
}

export interface TimePoint {
  t: number;
  v: number;
}

export interface WordTiming {
  /** Global word index (across phrases). */
  index: number;
  phrase: number;
  text: string;
  /** Character range in the original text, from the phonemizer. */
  span: [number, number];
  start: number;
  end: number;
}

export interface Timeline {
  segments: Segment[];
  /** Pitch track, Hz, every `TRACK_STEP` s (before tremor, flutter and jitter, which the synth adds). */
  f0: TimePoint[];
  /** Loudness envelope, linear gain (1 = a neutral syllable), same grid. */
  amp: TimePoint[];
  words: WordTiming[];
  /** Total length, s, including the lead-in and tail. */
  duration: number;
  voice: ResolvedVoice;
}

export const TRACK_STEP = 0.01;
const LEAD_IN = 0.05;
const TAIL = 0.12;

interface Unit {
  ph: Phoneme;
  spec: PhonemeSpec;
  phrase: number;
  word: number;
  wordInPhrase: number;
  syl: number;
  nSyl: number;
  stress: Stress;
  content: boolean;
  role: 'onset' | 'nucleus' | 'coda';
  wordInitial: boolean;
  wordFinalSyl: boolean;
  phraseFinalSyl: boolean;
  dur: number;
  /** The minimum duration the rules used (halved when unstressed), s. */
  minDur: number;
}

const voicedSound = (s: PhonemeSpec) => s.voiced;

/** Reduce an unstressed vowel toward schwa (undershoot); AH0 is schwa itself. */
function reduced(ph: Phoneme, s: PhonemeSpec): PhonemeSpec {
  if (ph === 'AH') return { ...s, target: SCHWA, glide: undefined };
  const toward = (f: Formants): Formants => ({
    f1: f.f1 + (SCHWA.f1 - f.f1) * 0.2,
    f2: f.f2 + (SCHWA.f2 - f.f2) * 0.2,
    f3: f.f3 + (SCHWA.f3 - f.f3) * 0.2,
    b1: f.b1,
    b2: f.b2,
    b3: f.b3,
  });
  return { ...s, target: toward(s.target), glide: s.glide && toward(s.glide) };
}

/** Flatten phrases into units with the context every rule needs. */
function unitsOf(phrases: Phrase[]): { units: Unit[][]; words: { phrase: number; text: string; span: [number, number]; content: boolean }[] } {
  const all: Unit[][] = [];
  const words: { phrase: number; text: string; span: [number, number]; content: boolean }[] = [];
  phrases.forEach((phrase, pi) => {
    const units: Unit[] = [];
    // A phrase of only function words ("Is it?") still accents its last stressed word.
    const anyContent = phrase.words.some((w) => w.content && w.syllables.length > 0);
    let lastWordWithSound = -1;
    phrase.words.forEach((w, wi) => {
      if (w.syllables.some((s) => s.phonemes.length > 0)) lastWordWithSound = wi;
    });
    phrase.words.forEach((w, wi) => {
      const wordIndex = words.length;
      const content = w.content || (!anyContent && wi === lastWordWithSound);
      words.push({ phrase: pi, text: w.text, span: w.span, content });
      let first = true;
      w.syllables.forEach((syl, si) => {
        const stress: Stress = content ? syl.stress : 0;
        const nucleusAt = syl.phonemes.findIndex((p) => isSyllabic(PHONEMES[p]));
        syl.phonemes.forEach((ph, k) => {
          const s = PHONEMES[ph];
          if (!s) return;
          const role = nucleusAt < 0 || k < nucleusAt ? 'onset' : k === nucleusAt ? 'nucleus' : 'coda';
          units.push({
            ph,
            spec: role === 'nucleus' && stress === 0 ? reduced(ph, s) : s,
            phrase: pi,
            word: wordIndex,
            wordInPhrase: wi,
            syl: si,
            nSyl: w.syllables.length,
            stress,
            content,
            role,
            wordInitial: first,
            wordFinalSyl: si === w.syllables.length - 1,
            phraseFinalSyl: wi === lastWordWithSound && si === w.syllables.length - 1,
            dur: 0,
            minDur: 0,
          });
          first = false;
        });
      });
    });
    all.push(units);
  });
  return { units: all, words };
}

/** Klatt 1979's duration rules for one phrase's units, in seconds, before rate. */
function klattDurations(units: Unit[]) {
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const s = u.spec;
    const prev = units[i - 1];
    const next = units[i + 1];
    let p = 1;
    let min = s.min;
    const unstressed = u.stress === 0;
    if (u.role === 'nucleus') {
      // Rules 2–3: phrase-final lengthening, otherwise shortening.
      p *= u.phraseFinalSyl ? 1.4 : 0.6;
      // Rule 4: not the word's last syllable.
      if (!u.wordFinalSyl) p *= 0.85;
      // Rule 5: polysyllabic words.
      if (u.nSyl > 1) p *= 0.8;
      // Rule 7: unstressed vowels are shorter and more compressible.
      if (unstressed) {
        min /= 2;
        p *= u.syl > 0 && !u.wordFinalSyl ? 0.5 : 0.7;
      } else if (u.stress === 2) p *= 0.9;
      // Rule 9: what follows the vowel in its word (fully only phrase-finally).
      const after = units.slice(i + 1).find((x) => x.word === u.word && x.role !== 'nucleus' && x.syl === u.syl);
      let p9 = 1;
      if (!after) p9 = u.wordFinalSyl ? 1.2 : 1;
      else {
        const c = postVocalicClass(after.spec);
        p9 = c === 'voicedFricative' ? 1.6 : c === 'voicedPlosive' ? 1.2 : c === 'nasal' ? 0.85 : c === 'voicelessPlosive' ? 0.7 : 1;
      }
      if (!u.phraseFinalSyl) p9 = 0.7 + 0.3 * p9;
      p *= p9;
    } else {
      // Rule 6: consonants not at the start of their word.
      if (!u.wordInitial) p *= 0.85;
      // Rule 7 for consonants: unstressed syllables.
      if (unstressed) {
        min /= 2;
        p *= u.role === 'onset' && (s.manner === 'liquid' || s.manner === 'glide') ? 0.5 : 0.7;
      }
      // Rule 2 for a phrase-final syllable's coda.
      if (u.phraseFinalSyl && u.role === 'coda') p *= 1.4;
      // Rule 10: consonant clusters.
      const cPrev = prev && !isSyllabic(prev.spec);
      const cNext = next && !isSyllabic(next.spec);
      if (cPrev && cNext) p *= 0.5;
      else if (cPrev || cNext) p *= 0.7;
    }
    u.dur = (min + (s.inherent - min) * p) / 1000;
    u.minDur = min / 1000;
  }
}

const isVowelUnit = (u: Unit | undefined) => !!u && isSyllabic(u.spec);
const isSonorantUnit = (u: Unit | undefined) => !!u && (isSyllabic(u.spec) || u.spec.manner === 'liquid' || u.spec.manner === 'glide');

/** Build the timed segments: durations, rate, stop releases and aspiration, flaps, pauses. */
function timeSegments(phrases: Phrase[], units: Unit[][], voice: ResolvedVoice): Segment[] {
  const rate = voice.rate;
  const segs: Segment[] = [];
  let t = 0;
  const silence = (dur: number, phrase: number) => {
    segs.push({ phoneme: null, spec: null, start: t, dur, stress: 0, word: -1, phrase, phraseFinal: false });
    t += dur;
  };
  silence(LEAD_IN, 0);
  units.forEach((list, pi) => {
    klattDurations(list);
    // Context rules that change a neighbor's duration go first.
    const extra = list.map(() => 0);
    const info = list.map((u, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const s = u.spec;
      const r: Partial<Segment> & { spec: PhonemeSpec } = { spec: s };
      if (u.ph === 'HH' && isVowelUnit(next)) {
        // HH is a whispered copy of its vowel.
        r.spec = { ...s, target: { ...next!.spec.target, b1: 300, b2: Math.max(next!.spec.target.b2, 150), b3: Math.max(next!.spec.target.b3, 250) } };
      }
      if ((u.ph === 'T' || u.ph === 'D') && prev && next && prev.word === u.word && next.word === u.word
        && (isVowelUnit(prev) || prev.ph === 'R') && isVowelUnit(next) && next.stress === 0) {
        r.flap = true;
        return r;
      }
      if (isStopLike(s)) {
        if (s.manner === 'affricate') {
          r.burstGain = 1;
        } else if (!next) {
          // Phrase-final: released, softer, a short breath after a voiceless one.
          r.burstGain = 0.6;
          r.vot = s.voiced ? 0 : 0.03;
        } else if (isStopLike(next.spec) || next.spec.manner === 'nasal') {
          r.burstGain = 0; // unreleased into the next closure
        } else {
          r.burstGain = s.voiced ? 0.7 : 1;
          if (!s.voiced && isSonorantUnit(next)) {
            const sCluster = prev && prev.ph === 'S' && prev.word === u.word && u.role === 'onset';
            const stressed = next.stress > 0 && u.role === 'onset';
            r.vot = sCluster ? 0.012 : stressed ? 0.055 : 0.03;
            // Rule 11: the aspiration takes time out of the next sound, which gets some back.
            if (!sCluster) extra[i + 1] += stressed ? 0.025 : 0.012;
          } else r.vot = s.voiced ? 0.006 : 0.012;
        }
        if (s.voiced && prev && voicedSound(prev.spec)) r.voiceBar = true;
      }
      return r;
    });
    list.forEach((u, i) => {
      const r = info[i];
      let dur = u.dur + extra[i];
      const s = r.spec;
      // Rate: the stretchable part scales fully, the minimum only partly (fast speech can't drop sounds).
      dur = u.minDur / Math.sqrt(rate) + Math.max(0, dur - u.minDur) / rate;
      dur = Math.max(dur, 0.012);
      if (r.flap) dur = 0.024 / Math.sqrt(rate);
      const seg: Segment = {
        phoneme: u.ph,
        spec: s,
        start: t,
        dur,
        stress: u.stress,
        word: u.word,
        phrase: pi,
        phraseFinal: u.phraseFinalSyl,
        flap: r.flap,
        voiceBar: r.voiceBar,
      };
      if (isStopLike(s) && !r.flap) {
        const burst = s.burst!;
        if (s.manner === 'affricate') {
          seg.release = t + dur * 0.45;
          seg.burstGain = 1;
        } else if (r.burstGain! > 0) {
          const vot = r.vot ?? 0;
          if (!list[i + 1]) seg.dur = dur = dur + vot; // the final breath is part of this sound
          seg.release = t + dur - burst.dur - (list[i + 1] ? 0 : vot);
          seg.burstGain = r.burstGain;
          seg.vot = vot;
        }
      }
      segs.push(seg);
      t += dur;
    });
    const pause = pi < phrases.length - 1 ? phrases[pi].pauseMs / 1000 / rate : 0;
    if (pause > 0) silence(pause, pi);
  });
  silence(TAIL, Math.max(0, phrases.length - 1));
  return segs;
}

/** A raised-cosine bump: 1 at x = 0, 0 at |x| ≥ 1. */
const bump = (x: number) => (Math.abs(x) >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x));

interface Accent {
  onset: number;
  peak: number;
  fall: number;
  height: number;
}

/** The melody, in semitones above the voice's base pitch, sampled on the track grid. */
function melody(segs: Segment[], phrases: Phrase[], words: { phrase: number; content: boolean }[], voice: ResolvedVoice, n: number) {
  const R = voice.rangeSemis;
  const semis = new Float64Array(n);
  const tAt = (k: number) => k * TRACK_STEP;
  phrases.forEach((phrase, pi) => {
    const ps = segs.filter((s) => s.phrase === pi && s.phoneme);
    if (ps.length === 0) return;
    const start = ps[0].start;
    const end = ps[ps.length - 1].start + ps[ps.length - 1].dur;
    const kind: PhraseEnd = phrase.end;
    // Accents: the primary-stressed vowel of each content word.
    const accentVowels: Segment[] = [];
    const wordIds = [...new Set(ps.map((s) => s.word))];
    for (const w of wordIds) {
      if (!words[w]?.content) continue;
      const vowels = ps.filter((s) => s.word === w && s.spec && isSyllabic(s.spec));
      if (vowels.length === 0) continue;
      const v = vowels.find((s) => s.stress === 1) ?? vowels.find((s) => s.stress === 2) ?? vowels[0];
      accentVowels.push(v);
    }
    const accents: Accent[] = [];
    accentVowels.forEach((v, i) => {
      const nuclear = i === accentVowels.length - 1;
      // The syllable's onset: back over the consonants before the vowel within its word.
      let onset = v.start;
      for (let k = segs.indexOf(v) - 1; k >= 0 && segs[k].word === v.word && segs[k].spec && !isSyllabic(segs[k].spec!); k--) onset = segs[k].start;
      let h = i === 0 ? 0.5 : Math.max(0.24, 0.5 * 0.82 ** i);
      if (kind === 'whQuestion' && i === 0) h = 0.62;
      if (nuclear) {
        h = kind === 'statement' ? (i === 0 ? 0.5 : 0.42)
          : kind === 'whQuestion' ? (i === 0 ? 0.6 : 0.36)
            : kind === 'continue' ? 0.34
              : kind === 'exclaim' ? 0.85
                : -0.12; // yes/no question: a low accent, then the rise
      } else if (kind === 'exclaim') h *= 1.25;
      const peakAt = nuclear && kind !== 'question' ? 0.4 : 0.6;
      accents.push({ onset: Math.min(onset, v.start - 0.03), peak: v.start + v.dur * peakAt, fall: nuclear ? 0.2 : 0.16, height: h });
    });
    const nuc = accents[accents.length - 1];
    const nucVowel = accentVowels[accentVowels.length - 1];
    // Tunes land where the voice is: the end of the last vowel or sonorant, not a final stop's silence.
    const lastVoiced = [...ps].reverse().find((s) => s.spec && (isSyllabic(s.spec) || s.spec.manner === 'nasal' || s.spec.manner === 'liquid' || s.spec.manner === 'glide'));
    const voicedEnd = lastVoiced ? lastVoiced.start + lastVoiced.dur : end;
    const raise = kind === 'exclaim' ? 0.12 : 0;
    const reset = 0.04 * Math.min(pi, 3);
    const k0 = Math.max(0, Math.floor((start - 0.15) / TRACK_STEP));
    const nextStart = segs.find((s) => s.phrase === pi + 1 && s.phoneme)?.start ?? Infinity;
    const k1 = Math.min(n - 1, Math.ceil(Math.min(end + 0.3, nextStart - 0.15) / TRACK_STEP));
    for (let k = k0; k <= k1; k++) {
      const t = tAt(k);
      const u = clamp((t - start) / Math.max(0.2, end - start), 0, 1);
      let v = 0.12 - 0.17 * u - reset + raise;
      let hi = 0;
      let lo = 0;
      for (const a of accents) {
        const x = t < a.peak ? (t - a.peak) / Math.max(0.08, a.peak - a.onset) : (t - a.peak) / a.fall;
        const b = a.height * bump(x);
        if (b > hi) hi = b;
        if (b < lo) lo = b;
      }
      v += hi + lo;
      if (nuc) {
        if (kind === 'question') {
          const from = nucVowel.start;
          const x = clamp((t - from) / Math.max(0.12, voicedEnd - from), 0, 1);
          v += 0.9 * x ** 1.2;
        } else if (kind === 'continue') {
          v += 0.16 * smoothstep(voicedEnd - 0.16, voicedEnd, t);
        } else {
          v -= 0.22 * smoothstep(nuc.peak, Math.max(end, nuc.peak + 0.15), t);
        }
      } else if (kind === 'question') {
        v += 0.6 * smoothstep(end - 0.3, end, t);
      } else v -= 0.2 * smoothstep(end - 0.3, end, t);
      semis[k] = Math.max(v * R, -0.35 * R - 1);
    }
  });
  // Micro-prosody, in absolute semitones (it doesn't scale with range).
  const micro = new Float64Array(n);
  segs.forEach((s, i) => {
    if (!s.spec || !s.phoneme) return;
    const k0 = Math.max(0, Math.floor(s.start / TRACK_STEP));
    const k1 = Math.min(n - 1, Math.ceil((s.start + s.dur) / TRACK_STEP));
    if (isObstruent(s.spec) && s.spec.voiced) {
      for (let k = k0; k <= k1; k++) micro[k] -= 0.8 * bump((tAt(k) - (s.start + s.dur / 2)) / (s.dur / 2 + 0.01));
    }
    if (isSyllabic(s.spec)) {
      const intrinsic = INTRINSIC_F0[s.phoneme] ?? 0;
      for (let k = k0; k <= k1; k++) micro[k] += intrinsic;
      const prev = segs[i - 1];
      if (prev?.spec && isObstruent(prev.spec) && !prev.spec.voiced) {
        for (let k = k0; k <= k1; k++) micro[k] += 0.8 * clamp(1 - (tAt(k) - s.start) / 0.06, 0, 1);
      }
    }
  });
  for (let k = 0; k < n; k++) semis[k] += micro[k];
  return smooth(semis, 2);
}

/** A short triangular smoothing, `passes` times ([1 2 1] / 4). */
function smooth(x: Float64Array, passes: number) {
  let a = x;
  for (let p = 0; p < passes; p++) {
    const b = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) b[i] = (a[Math.max(0, i - 1)] + 2 * a[i] + a[Math.min(a.length - 1, i + 1)]) / 4;
    a = b;
  }
  return a;
}

/** The loudness envelope in dB on the track grid. */
function dynamics(segs: Segment[], phrases: Phrase[], semis: Float64Array, voice: ResolvedVoice, n: number) {
  const db = new Float64Array(n);
  segs.forEach((s) => {
    if (!s.phoneme) return;
    const k0 = Math.max(0, Math.floor(s.start / TRACK_STEP));
    const k1 = Math.min(n - 1, Math.ceil((s.start + s.dur) / TRACK_STEP));
    const level = s.stress === 1 ? 1.5 : s.stress === 2 ? 0.5 : -2;
    for (let k = k0; k <= k1; k++) db[k] = level;
  });
  phrases.forEach((phrase, pi) => {
    const ps = segs.filter((s) => s.phrase === pi && s.phoneme);
    if (ps.length === 0) return;
    const start = ps[0].start;
    const end = ps[ps.length - 1].start + ps[ps.length - 1].dur;
    const k0 = Math.max(0, Math.floor(start / TRACK_STEP));
    const k1 = Math.min(n - 1, Math.ceil(end / TRACK_STEP));
    for (let k = k0; k <= k1; k++) {
      const t = k * TRACK_STEP;
      const u = clamp((t - start) / Math.max(0.2, end - start), 0, 1);
      db[k] += -2.5 * u + (phrase.end === 'exclaim' ? 2 : 0);
      if (phrase.end !== 'question') db[k] -= 3 * smoothstep(end - 0.12, end, t);
      // Louder where the pitch is up (accents), as voices do.
      db[k] += 0.3 * Math.max(0, semis[k] - 0.1 * voice.rangeSemis);
    }
  });
  return smooth(db, 3);
}

export function prosody(phrases: Phrase[], voice: VoiceProfile, delivery: Delivery = DELIVERIES.neutral): Timeline {
  const rv = resolveVoice(voice, delivery);
  const { units, words } = unitsOf(phrases);
  const segments = timeSegments(phrases, units, rv);
  const last = segments[segments.length - 1];
  const duration = last.start + last.dur;
  const n = Math.ceil(duration / TRACK_STEP) + 1;
  const semis = melody(segments, phrases, words, rv, n);
  const db = dynamics(segments, phrases, semis, rv, n);
  const f0: TimePoint[] = [];
  const amp: TimePoint[] = [];
  for (let k = 0; k < n; k++) {
    f0.push({ t: k * TRACK_STEP, v: rv.baseF0 * 2 ** (semis[k] / 12) });
    amp.push({ t: k * TRACK_STEP, v: 10 ** (db[k] / 20) });
  }
  const timings: WordTiming[] = words.map((w, index) => {
    const ws = segments.filter((s) => s.word === index);
    // A word with no sounds sits at the time of whatever came before it.
    const before = segments.filter((s) => s.word >= 0 && s.word < index).pop();
    const at = ws.length ? ws[0].start : before ? before.start + before.dur : LEAD_IN;
    const end = ws.length ? ws[ws.length - 1].start + ws[ws.length - 1].dur : at;
    return { index, phrase: w.phrase, text: w.text, span: w.span, start: at, end };
  });
  return { segments, f0, amp, words: timings, duration, voice: rv };
}

/** Sample a point track (linear between points, held at the ends). Points must be evenly spaced from t = 0 by `TRACK_STEP`. */
export function trackAt(track: TimePoint[], t: number) {
  if (track.length === 0) return 0;
  const x = t / TRACK_STEP;
  const i = Math.floor(x);
  if (i <= 0) return track[0].v;
  if (i >= track.length - 1) return track[track.length - 1].v;
  const w = x - i;
  return track[i].v + (track[i + 1].v - track[i].v) * w;
}
