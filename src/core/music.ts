/**
 * Music as data: a small notation for writing tunes in code, and a compiler that turns a
 * song into timed note events. No Web Audio here (that's `synth.ts`), so it's testable.
 *
 * A song is laid out like an arrangement in a DAW: sections (intro, A, B...) placed end to
 * end, each with a chord progression, an optional hand-written melody, and layers. A layer
 * is either the melody played on some instrument, or an accompaniment pattern (a rolling
 * harp, a bass line, a drum groove) that follows the chords, the way an arpeggiator or a
 * chord-follow MIDI effect would.
 *
 * Notation, one bar between each `|` (every bar must add up to a full bar of steps):
 * - melody: `C5*2 F5*3 G5 A5*2`: note name + octave, `*n` = lasts n steps (default 1),
 *   `.` = rest. With 2 steps per beat, a step is an eighth note.
 * - chords: `F | Am | Dm Gm | C7`: two chords in one bar split it evenly.
 * - tone patterns: `0*3 2 0*2 2*2`: numbers pick chord tones (0 root, 1 third, 2 fifth,
 *   3 root an octave up, ...), so the same pattern fits every chord.
 * - beat patterns: one character per step, `X` accent, `x` normal, `o` soft, `.` rest.
 */

export type Instrument =
  | 'flute' | 'bell' | 'box' | 'harp' | 'pad' | 'bass' | 'drive' | 'brass' | 'mallet'
  | 'kick' | 'snare' | 'hat' | 'shaker' | 'tom';

export interface NoteEvent {
  /** Seconds from the start of the song. */
  at: number;
  /** How long the note is held, in seconds (the instrument adds its own release). */
  dur: number;
  /** Hz; 0 for drums. */
  freq: number;
  inst: Instrument;
  /** Loudness, roughly 0–1. */
  vel: number;
}

export type Layer =
  /** The section's melody, `shift` octaves up or down. */
  | { type: 'melody'; inst: Instrument; shift?: number; vel?: number }
  /** A tone pattern over the current chord, rooted at `octave`; repeats every bar(s) it spans. */
  | { type: 'tones'; inst: Instrument; pattern: string; octave: number; vel?: number }
  /** The chord held for as long as it lasts, voiced close to `center` (a MIDI note). */
  | { type: 'chord'; inst: Instrument; center: number; vel?: number }
  /** A drum pattern; repeats every bar(s) it spans. */
  | { type: 'beat'; inst: Instrument; pattern: string; vel?: number };

export interface Section {
  name: string;
  chords: string;
  melody?: string;
  layers: Layer[];
}

export interface Song {
  name: string;
  bpm: number;
  stepsPerBeat: number;
  beatsPerBar: number;
  sections: Section[];
  /** The section the song jumps back to when it ends (skipping the intro). */
  loopFrom: number;
}

export interface CompiledSong {
  name: string;
  events: NoteEvent[];
  /** Seconds. */
  length: number;
  /** Where the loop restarts, in seconds. */
  loopAt: number;
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 73, "Bb4" → 70 (A4 = 69). */
export function midiOf(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + accidental;
}

/** Equal temperament, A4 = 440 Hz. */
export const freqOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
};

export interface Chord {
  /** Pitch class 0–11 (C = 0). */
  root: number;
  /** Semitones above the root. */
  tones: number[];
  /** Slash chords ("F#/C#"): the bass note's pitch class. */
  bass?: number;
}

const pitchClass = (letter: string, acc: string | undefined) => (NOTE_INDEX[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;

/** "Am" → A minor, "Bbmaj7", "Csus4", "A7", and slash chords like "F#/C#" (F# over C#). */
export function chordOf(name: string): Chord {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(name);
  const tones = m && QUALITIES[m[3]];
  if (!m || !tones) throw new Error(`Bad chord "${name}"`);
  const chord: Chord = { root: pitchClass(m[1], m[2]), tones };
  if (m[4]) chord.bass = pitchClass(m[4], m[5]);
  return chord;
}

/**
 * The n-th tone of a chord stacked upward: 0 root, 1 third, 2 fifth, then an octave up.
 * For a slash chord, tone 0 is the bass note (just below the root), so bass lines and
 * arpeggios start on it.
 */
export function chordTone(chord: Chord, index: number, octave: number): number {
  const n = chord.tones.length;
  const base = 12 * (octave + 1) + chord.root;
  if (index === 0 && chord.bass !== undefined) return base - ((chord.root - chord.bass + 12) % 12 || 12);
  return base + chord.tones[index % n] + 12 * Math.floor(index / n);
}

/** The chord's tones each placed in the octave nearest `center`: smooth pad voicings for free. */
export function voicing(chord: Chord, center: number): number[] {
  const notes = chord.tones.map((t) => {
    const pc = (chord.root + t) % 12;
    return pc + 12 * Math.round((center - pc) / 12);
  });
  return [...new Set(notes)].sort((a, b) => a - b);
}

export interface Step<T> {
  item: T;
  /** Offset in steps from the start of the line. */
  step: number;
  steps: number;
}

/**
 * Splits a barred line into timed items. Throws if any bar doesn't add up to
 * `stepsPerBar`, which catches miscounted melodies at test time instead of by ear.
 */
export function parseLine<T>(line: string, stepsPerBar: number, item: (token: string) => T): Step<T>[] {
  const out: Step<T>[] = [];
  line.split('|').forEach((bar, b) => {
    let at = 0;
    for (const token of bar.trim().split(/\s+/).filter(Boolean)) {
      const m = /^([^*]+)(?:\*(\d+))?$/.exec(token);
      if (!m) throw new Error(`Bad token "${token}" in bar ${b + 1}`);
      const steps = m[2] ? Number(m[2]) : 1;
      out.push({ item: item(m[1]), step: b * stepsPerBar + at, steps });
      at += steps;
    }
    if (at !== stepsPerBar) throw new Error(`Bar ${b + 1} has ${at} steps, expected ${stepsPerBar}: "${bar.trim()}"`);
  });
  return out;
}

/** Chords as timed spans; `Dm Gm` in one bar gives each half. */
export function parseChords(line: string, stepsPerBar: number): Step<Chord>[] {
  return line.split('|').flatMap((bar, b) => {
    const names = bar.trim().split(/\s+/).filter(Boolean);
    if (!names.length || stepsPerBar % names.length) throw new Error(`Bar ${b + 1} can't split into ${names.length} chords`);
    const steps = stepsPerBar / names.length;
    return names.map((n, i) => ({ item: chordOf(n), step: b * stepsPerBar + i * steps, steps }));
  });
}

const rest = (t: string) => (t === '.' ? null : t);
const BEAT_VEL: Record<string, number> = { X: 1, x: 0.65, o: 0.35 };

/** The chord sounding at a step. */
function chordAt(chords: Step<Chord>[], step: number) {
  for (let i = chords.length - 1; i >= 0; i--) if (chords[i].step <= step) return chords[i].item;
  return chords[0].item;
}

/** A section's events, with times in steps from the section's start. */
function sectionEvents(section: Section, stepsPerBar: number) {
  const chords = parseChords(section.chords, stepsPerBar);
  const total = (section.chords.split('|').length) * stepsPerBar;
  const events: Array<{ step: number; steps: number; midi: number | null; inst: Instrument; vel: number }> = [];

  /** Repeats a pattern (one or more bars long) across the whole section. */
  const repeat = <T>(steps: Step<T>[], length: number, fn: (s: Step<T>, at: number) => void) => {
    for (let base = 0; base < total; base += length) {
      for (const s of steps) if (base + s.step < total) fn(s, base + s.step);
    }
  };

  for (const layer of section.layers) {
    const vel = layer.vel ?? 1;
    if (layer.type === 'melody') {
      if (!section.melody) throw new Error(`Section "${section.name}" has a melody layer but no melody`);
      const notes = parseLine(section.melody, stepsPerBar, rest);
      const bars = section.melody.split('|').length;
      if (bars * stepsPerBar !== total) throw new Error(`Section "${section.name}": melody has ${bars} bars, chords have ${total / stepsPerBar}`);
      for (const n of notes) {
        if (n.item) events.push({ step: n.step, steps: n.steps, midi: midiOf(n.item) + 12 * (layer.shift ?? 0), inst: layer.inst, vel });
      }
    } else if (layer.type === 'tones') {
      const steps = parseLine(layer.pattern, stepsPerBar, (t) => (t === '.' ? null : Number(t)));
      const length = layer.pattern.split('|').length * stepsPerBar;
      repeat(steps, length, (s, at) => {
        if (s.item === null || Number.isNaN(s.item)) return;
        events.push({ step: at, steps: s.steps, midi: chordTone(chordAt(chords, at), s.item, layer.octave), inst: layer.inst, vel });
      });
    } else if (layer.type === 'chord') {
      for (const c of chords) {
        for (const midi of voicing(c.item, layer.center)) events.push({ step: c.step, steps: c.steps, midi, inst: layer.inst, vel });
      }
    } else {
      const bars = layer.pattern.split('|').map((b) => b.replace(/\s+/g, ''));
      for (const b of bars) if (b.length !== stepsPerBar) throw new Error(`Beat bar "${b}" isn't ${stepsPerBar} steps`);
      const chars = bars.join('');
      for (let at = 0; at < total; at++) {
        const v = BEAT_VEL[chars[at % chars.length]];
        if (v) events.push({ step: at, steps: 1, midi: null, inst: layer.inst, vel: vel * v });
      }
    }
  }
  return { events, total };
}

/** Lays the sections end to end and converts steps to seconds. */
export function compile(song: Song): CompiledSong {
  const stepsPerBar = song.stepsPerBeat * song.beatsPerBar;
  const stepDur = 60 / song.bpm / song.stepsPerBeat;
  const events: NoteEvent[] = [];
  let offset = 0;
  let loopAt = 0;
  song.sections.forEach((section, i) => {
    if (i === song.loopFrom) loopAt = offset * stepDur;
    const s = sectionEvents(section, stepsPerBar);
    for (const e of s.events) {
      events.push({
        at: (offset + e.step) * stepDur,
        dur: e.steps * stepDur,
        freq: e.midi === null ? 0 : freqOf(e.midi),
        inst: e.inst,
        vel: e.vel,
      });
    }
    offset += s.total;
  });
  events.sort((a, b) => a.at - b.at);
  return { name: song.name, events, length: offset * stepDur, loopAt };
}
