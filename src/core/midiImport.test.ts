import { describe, expect, it } from 'vitest';
import { parseMidi } from './midiFile';
import { chordLine, nameChord, noteName, quantize, splitVoices, toLine } from './midiImport';
import { compile, sliceBars, type Song } from './music';
import { DAY_SONGS } from './tracks';
import { midi as valleyMidi } from './imported/valley-overworld-day-midis';

/** A tiny one-track Standard MIDI File: `notes` are [beat, beats, midi]. 96 ticks per beat. */
function smf(notes: Array<[number, number, number]>, name = 'melody'): Uint8Array {
  const vlq = (v: number) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const events = notes.flatMap(([beat, beats, midi]) => [
    { tick: Math.round(beat * 96), bytes: [0x90, midi, 100] },
    { tick: Math.round((beat + beats) * 96), bytes: [0x80, midi, 0] },
  ]).sort((a, b) => a.tick - b.tick);
  const body: number[] = [0, 0xff, 0x03, name.length, ...[...name].map((c) => c.charCodeAt(0))];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const len = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    ...'MThd'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 6, 0, 1, 0, 1, 0, 96,
    ...'MTrk'.split('').map((c) => c.charCodeAt(0)), ...len(body.length), ...body,
  ]);
}

describe('MIDI file reader', () => {
  it('reads notes in beats, with the track name', () => {
    const file = parseMidi(smf([[0, 1, 60], [1.5, 0.5, 64]], 'lead'));
    expect(file.tracks[0].name).toBe('lead');
    expect(file.tracks[0].notes).toEqual([
      { beat: 0, beats: 1, midi: 60, vel: 100 },
      { beat: 1.5, beats: 0.5, midi: 64, vel: 100 },
    ]);
    expect(file.tempos).toEqual([]);
  });

  it('rejects something that is not a MIDI file', () => {
    expect(() => parseMidi(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/MThd/);
  });
});

describe('importing notes as notation', () => {
  const grid = (notes: Array<[number, number, number]>) => quantize(parseMidi(smf(notes)).tracks[0].notes, 2);

  it('writes rests, notes and a pickup into barred lines', () => {
    const q = grid([[3.5, 0.5, 66], [4, 1, 67], [5, 3, 71]]);
    expect(toLine(splitVoices(q.notes)[0], 2, 8)).toBe('.*7 F#4 | G4*2 B4*6');
  });

  it('ties a note that crosses a bar line, and the tie plays as one long note', () => {
    const q = grid([[2, 4, 71]]); // B4 for four beats from beat 3 of bar 1
    const text = toLine(splitVoices(q.notes)[0], 2, 8);
    expect(text).toBe('.*4 B4^*4 | B4*4 .*4');
    const song: Song = {
      name: 't', bpm: 120, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 0,
      sections: [{ name: 'A', chords: 'G | G', melody: text, layers: [{ type: 'melody', inst: 'flute' }] }],
    };
    const events = compile(song).events;
    expect(events).toHaveLength(1);
    expect(events[0].dur).toBeCloseTo(2); // 4 beats at 120 bpm
  });

  it('splits a held note and the phrase over it into two voices', () => {
    const q = grid([[0, 4, 71], [1, 1, 78], [2, 1, 79], [4, 1, 60]]);
    const voices = splitVoices(q.notes);
    expect(voices).toHaveLength(2);
    expect(voices[0].map((n) => noteName(n.midi))).toEqual(['B4', 'C4']);
    expect(voices[1].map((n) => noteName(n.midi))).toEqual(['F#5', 'G5']);
  });

  it('treats a note held one step too long as one voice, cut at the next note', () => {
    const q = grid([[0, 2, 69], [1.5, 0.5, 66]]); // A ends half a beat after F# begins
    const voices = splitVoices(q.notes);
    expect(voices).toHaveLength(1);
    expect(toLine(voices[0], 1, 8)).toBe('A4*3 F#4 .*4');
  });

  it('keeps two notes that start together apart', () => {
    expect(splitVoices(grid([[0, 1, 61], [0, 1, 73]]).notes)).toHaveLength(2);
  });

  it('reports notes that are off the grid', () => {
    const q = quantize([{ beat: 0.33, beats: 1, midi: 60, vel: 90 }], 2);
    expect(q.offGrid).toHaveLength(1);
    expect(quantize([{ beat: 0.5, beats: 1, midi: 60, vel: 90 }], 2).offGrid).toHaveLength(0);
  });
});

describe('naming chords', () => {
  it('names seventh chords, slash chords and says when it cannot', () => {
    expect(nameChord([55, 59, 62, 66]).name).toBe('Gmaj7');
    expect(nameChord([50, 57, 61, 66]).name).toBe('Dmaj7');
    expect(nameChord([54, 57, 62]).name).toBe('D/F#');
    expect(nameChord([60, 61, 62, 63]).problem).toMatch(/no known chord/);
  });

  it('writes one chord per bar, or two when the halves differ', () => {
    const notes = [
      { step: 0, steps: 8, midi: 55 }, { step: 0, steps: 8, midi: 59 }, { step: 0, steps: 8, midi: 62 },
      { step: 8, steps: 4, midi: 57 }, { step: 8, steps: 4, midi: 61 }, { step: 8, steps: 4, midi: 64 },
      { step: 12, steps: 4, midi: 55 }, { step: 12, steps: 4, midi: 59 }, { step: 12, steps: 4, midi: 62 },
    ];
    expect(chordLine(notes, 2, 8).line).toBe('G | A G');
  });
});

describe('slicing a line into sections', () => {
  it('takes the named bars', () => {
    expect(sliceBars('A4*8 | B4*8 | C5*8', 1, 2)).toBe('B4*8 | C5*8');
    expect(() => sliceBars('A4*8', 0, 2)).toThrow(/outside/);
  });
});

describe("the owner's valley theme", () => {
  it('has every imported line the full length of the song', () => {
    for (const text of Object.values(valleyMidi.lines)) expect(text.split('|')).toHaveLength(valleyMidi.bars);
    expect(valleyMidi.chords.split('|')).toHaveLength(valleyMidi.bars);
  });

  it('plays their notes: the piano pickup lands on beat 31.5, the backing flute on beat 64', () => {
    const c = compile(DAY_SONGS['valley-wakes']);
    const beat = 60 / DAY_SONGS['valley-wakes'].bpm;
    const flutes = c.events.filter((e) => e.inst === 'keys').map((e) => e.at / beat);
    // F#4 (pickup) at beat 31.5, G4 at 32.
    expect(flutes.some((b) => Math.abs(b - 31.5) < 1e-6)).toBe(true);
    expect(flutes.some((b) => Math.abs(b - 32) < 1e-6)).toBe(true);
    const backing = c.events.filter((e) => e.inst === 'flute').map((e) => e.at / beat);
    expect(Math.min(...backing)).toBeCloseTo(64);
  });

  it('keeps the original day song available', () => {
    expect(compile(DAY_SONGS['ember-hills']).events.length).toBeGreaterThan(100);
  });
});
