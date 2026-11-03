import { describe, expect, it } from 'vitest';
import { chordOf, chordTone, compile, freqOf, midiOf, parseChords, parseLine, voicing, type Song } from './music';
import { SONGS, compiledSong } from './tracks';

describe('music notation', () => {
  it('names notes in equal temperament', () => {
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('C#5')).toBe(73);
    expect(midiOf('Bb4')).toBe(70);
    expect(freqOf(69)).toBeCloseTo(440);
    expect(freqOf(midiOf('C5'))).toBeCloseTo(523.25, 1);
    expect(() => midiOf('H4')).toThrow();
  });

  it('builds chords and stacks their tones upward', () => {
    expect(chordOf('Am')).toEqual({ root: 9, tones: [0, 3, 7] });
    expect(chordOf('Bbmaj7')).toEqual({ root: 10, tones: [0, 4, 7, 11] });
    expect(() => chordOf('Cwhatever')).toThrow();
    // A slash chord: F# major over C#; its tone 0 (the bass) is the C# just below.
    const fs = chordOf('F#/C#');
    expect(fs).toEqual({ root: 6, tones: [0, 4, 7], bass: 1 });
    expect(chordTone(fs, 0, 3)).toBe(midiOf('C#3'));
    expect(chordTone(fs, 1, 3)).toBe(midiOf('A#3'));
    // D over F♯: the F♯ is 8 semitones below D, so it goes just above instead (not into the mud).
    expect(chordTone(chordOf('D/F#'), 0, 2)).toBe(midiOf('F#2'));
    const f = chordOf('F');
    expect([0, 1, 2, 3, 4].map((i) => chordTone(f, i, 3))).toEqual([53, 57, 60, 65, 69]); // F3 A3 C4 F4 A4
  });

  it('voices chords near a center so pads move smoothly', () => {
    for (const name of ['C', 'F', 'G', 'Am', 'Bb', 'E']) {
      for (const n of voicing(chordOf(name), 62)) expect(Math.abs(n - 62)).toBeLessThanOrEqual(6);
    }
  });

  it('rejects bars that do not add up', () => {
    expect(parseLine('C5*2 D5*2 E5*4 | F5*8', 8, (t) => t).map((s) => s.step)).toEqual([0, 2, 4, 8]);
    expect(() => parseLine('C5*2 D5*2 E5*3', 8, (t) => t)).toThrow(/Bar 1 has 7 steps/);
    expect(parseChords('F | Dm Gm', 8).map((c) => [c.step, c.steps])).toEqual([[0, 8], [8, 4], [12, 4]]);
  });

  it('compiles sections end to end with the loop point after the intro', () => {
    const song: Song = {
      name: 't', bpm: 120, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
      sections: [
        { name: 'intro', chords: 'C', layers: [{ type: 'beat', inst: 'kick', pattern: 'X...x...' }] },
        { name: 'A', chords: 'C | G', melody: 'C5*8 | B4*4 D5*4', layers: [{ type: 'melody', inst: 'flute', shift: 1 }] },
      ],
    };
    const c = compile(song);
    expect(c.length).toBeCloseTo(3 * 2); // 3 bars of 4 beats at 120 bpm
    expect(c.loopAt).toBeCloseTo(2);
    expect(c.events.map((e) => [e.at, e.inst])).toEqual([[0, 'kick'], [1, 'kick'], [2, 'flute'], [4, 'flute'], [5, 'flute']]);
    expect(c.events[2].freq).toBeCloseTo(freqOf(midiOf('C6')));
    expect(c.events[2].dur).toBeCloseTo(2);
  });

  it('knows 6th chords, also over a bass note', () => {
    expect(chordOf('D6')).toEqual({ root: 2, tones: [0, 4, 7, 9] });
    expect(chordOf('D6/A')).toEqual({ root: 2, tones: [0, 4, 7, 9], bass: 9 });
  });

  it('swing delays the off-beat steps only', () => {
    const song = (swing?: number): Song => ({
      name: 't', bpm: 120, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 0, swing,
      sections: [{ name: 'A', chords: 'C', layers: [{ type: 'beat', inst: 'hat', pattern: 'xxxxxxxx' }] }],
    });
    const straight = compile(song()).events.map((e) => e.at);
    const swung = compile(song(0.3)).events.map((e) => e.at);
    const step = 0.25; // an eighth at 120 bpm
    swung.forEach((at, i) => expect(at).toBeCloseTo(straight[i] + (i % 2 ? 0.3 * step : 0)));
  });

  it('catches a melody whose length does not match its chords', () => {
    const song: Song = {
      name: 't', bpm: 120, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 0,
      sections: [{ name: 'A', chords: 'C | G', melody: 'C5*8', layers: [{ type: 'melody', inst: 'flute' }] }],
    };
    expect(() => compile(song)).toThrow(/melody has 1 bars/);
  });
});

describe('the game themes', () => {
  for (const mood of Object.keys(SONGS) as Array<keyof typeof SONGS>) {
    it(`${mood} compiles into a sensible loop`, () => {
      const c = compiledSong(mood);
      expect(c.events.length).toBeGreaterThan(100);
      expect(c.loopAt).toBeGreaterThan(0);
      expect(c.length - c.loopAt).toBeGreaterThan(30); // a loop long enough not to grate
      for (let i = 1; i < c.events.length; i++) expect(c.events[i].at).toBeGreaterThanOrEqual(c.events[i - 1].at);
      for (const e of c.events) {
        expect(e.at).toBeLessThan(c.length);
        // Pitched notes stay in a comfortable range (G1 to E7).
        if (!e.freq) continue;
        expect(e.freq).toBeGreaterThan(48);
        expect(e.freq).toBeLessThan(2700);
      }
    });
  }
});
