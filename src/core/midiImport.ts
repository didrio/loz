/**
 * Turns the notes of a MIDI file into the game's music notation (`music.ts`): quantizes them
 * to the step grid, splits overlapping notes into voices, writes barred lines (ties across
 * bar lines) and names the chords bar by bar. Pure functions: `scripts/midi-import.mjs`
 * adds the file reading and writing, and `npm run midi` is how it is run.
 *
 * Tempo is not part of an import: it lives in the arrangement (`tracks.ts`), so the owner's
 * file only supplies *what* is played and *when*, in beats.
 */
import type { MidiNote } from './midiFile.ts';
import { QUALITIES } from './music.ts';

export interface StepNote {
  step: number;
  steps: number;
  midi: number;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** 61 → "C#4" (the notation's spelling; flats are never written). */
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

export interface Quantized {
  notes: StepNote[];
  /** Notes that were moved by more than a quarter of a step, e.g. played-in timing or triplets. */
  offGrid: Array<{ beat: number; midi: number; error: number }>;
}

/** Snaps starts and lengths to the grid (`stepsPerBeat` steps per quarter note); a note is at least one step. */
export function quantize(notes: MidiNote[], stepsPerBeat: number): Quantized {
  const offGrid: Quantized['offGrid'] = [];
  const out = notes.map((n) => {
    const raw = n.beat * stepsPerBeat;
    const step = Math.round(raw);
    if (Math.abs(raw - step) > 0.25) offGrid.push({ beat: n.beat, midi: n.midi, error: raw - step });
    const steps = Math.max(1, Math.round((n.beat + n.beats) * stepsPerBeat) - step);
    return { step, steps, midi: n.midi };
  });
  return { notes: out, offGrid };
}

/**
 * Splits notes that sound at the same time into voices: each note goes to the first voice
 * that is free when it starts, so a long note on voice 1 and a phrase that answers over it
 * on voice 2 come out as two clean lines. A note that overlaps the next by one step or less
 * is a note held a little long, not a second voice: it is cut at the next note (see `toLine`).
 */
export function splitVoices(notes: StepNote[]): StepNote[][] {
  const voices: StepNote[][] = [];
  const sorted = [...notes].sort((a, b) => a.step - b.step || a.midi - b.midi);
  for (const n of sorted) {
    const v = voices.find((voice) => {
      const last = voice[voice.length - 1];
      return last.step < n.step && last.step + last.steps <= n.step + 1;
    });
    if (v) v.push(n);
    else voices.push([n]);
  }
  return voices;
}

/**
 * One voice as a barred line of `bars` bars: rests as `.*n`, a note that crosses a bar line
 * tied (`B4^*3 | B4*8`). A note that runs into the next one is cut short at it.
 */
export function toLine(voice: StepNote[], bars: number, stepsPerBar: number): string {
  const total = bars * stepsPerBar;
  const cells: Array<string | null> = Array.from({ length: total }, () => null); // a note name per step, '' = held on from the step before
  voice.forEach((n, i) => {
    const next = voice[i + 1];
    const end = Math.min(n.step + n.steps, next ? next.step : total, total);
    for (let s = n.step; s < end; s++) cells[s] = s === n.step ? noteName(n.midi) : '';
  });
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    const tokens: string[] = [];
    let s = b * stepsPerBar;
    const barEnd = s + stepsPerBar;
    while (s < barEnd) {
      const cell = cells[s];
      let e = s + 1;
      while (e < barEnd && (cell === null ? cells[e] === null : cells[e] === '')) e++;
      const len = e - s;
      const len1 = len > 1 ? `*${len}` : '';
      if (cell === null) tokens.push(`.${len1}`);
      else {
        // A held-over start (cell '' at the bar's first step) means the previous bar's note ran on.
        const name = cell === '' ? noteName(heldPitch(voice, s)) : cell;
        const tied = e === barEnd && cells[e] === '' ? '^' : '';
        tokens.push(`${name}${tied}${len1}`);
      }
      s = e;
    }
    out.push(tokens.join(' '));
  }
  return out.join(' | ');
}

/** The pitch of the note sounding at a step. */
function heldPitch(voice: StepNote[], step: number): number {
  for (let i = voice.length - 1; i >= 0; i--) if (voice[i].step <= step) return voice[i].midi;
  throw new Error(`No note sounding at step ${step}`);
}

export interface NamedChord {
  name: string;
  /** Why a name could not be found (the chord is then written as "?"). */
  problem?: string;
}

/** "G B D F#" over G → "Gmaj7"; the lowest note off the root makes a slash chord ("D/F#"). */
export function nameChord(midis: number[]): NamedChord {
  if (!midis.length) return { name: '?', problem: 'no notes' };
  const lowest = Math.min(...midis) % 12;
  const set = new Set(midis.map((m) => m % 12));
  const matches: Array<{ root: number; quality: string }> = [];
  for (const root of set) {
    for (const [quality, tones] of Object.entries(QUALITIES)) {
      const pcs = new Set(tones.map((t) => (root + t) % 12));
      if (pcs.size === set.size && [...set].every((pc) => pcs.has(pc))) matches.push({ root, quality });
    }
  }
  if (!matches.length) return { name: '?', problem: `no known chord for ${[...set].map((pc) => NAMES[pc]).join(' ')}` };
  // Prefer the chord rooted on the bass note, then the simplest quality (fewest tones).
  matches.sort((a, b) => Number(b.root === lowest) - Number(a.root === lowest) || QUALITIES[a.quality].length - QUALITIES[b.quality].length);
  const m = matches[0];
  const slash = m.root === lowest ? '' : `/${NAMES[lowest]}`;
  return { name: `${NAMES[m.root]}${m.quality}${slash}` };
}

/**
 * The chord line, bar by bar: the notes sounding at each half bar are named, and a bar whose
 * halves differ is written as two chords. Chords that only change every few bars repeat in every bar.
 */
export function chordLine(notes: StepNote[], bars: number, stepsPerBar: number): { line: string; problems: string[] } {
  const problems: string[] = [];
  const at = (step: number) => nameChord(notes.filter((n) => n.step <= step && step < n.step + n.steps).map((n) => n.midi));
  const half = stepsPerBar / 2;
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    const first = at(b * stepsPerBar);
    const second = at(b * stepsPerBar + half);
    for (const c of [first, second]) if (c.problem) problems.push(`bar ${b + 1}: ${c.problem}`);
    out.push(first.name === second.name ? first.name : `${first.name} ${second.name}`);
  }
  return { line: out.join(' | '), problems };
}
