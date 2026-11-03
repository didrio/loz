/**
 * "The Valley Wakes": the owner's own day theme. Their notes (imported from Ableton MIDI by
 * `npm run midi -- valley-overworld-day-midis`, see `imported/`) are used as written: the two
 * melody voices, the backing melody, the bass and the chords (Gmaj7 two bars, Dmaj7 two bars,
 * struck on every beat). The arrangement around them is ours: instruments, the harp, the
 * drums, a rising build, and an eight-bar bridge written to lead back into the tune.
 *
 * Re-exporting the MIDI and running the import again changes the notes here without
 * touching the arrangement. A bar count in a section is "which bar of the file does this
 * section start at" (0-based), see `part`.
 */
import { midi } from './imported/valley-overworld-day-midis';
import { sliceBars, type Instrument, type Layer, type Section, type Song } from './music';

const BARS = 8;
/** The owner's notes for the eight bars starting at bar `from` (0-based) of the file. */
const part = (from: number) => ({
  chords: sliceBars(midi.chords, from, BARS),
  lines: Object.fromEntries(Object.entries(midi.lines).map(([k, v]) => [k, sliceBars(v, from, BARS)])),
});

const line = (inst: Instrument, name: string, vel = 1, shift = 0): Layer => ({ type: 'melody', inst, line: name, vel, shift });

// What the owner wrote.
const lead = line('keys', 'melody');
const answer = line('keys', 'melody-2', 0.85);
const answerBell = line('bell', 'melody-2', 0.3);
const backing = line('flute', 'backing-melody', 0.55);
const theirBass = line('bass', 'bass', 0.75);
// Their roots (G, D) on the downbeats, with the fifth, the octave and a fill moving between them
// (tone numbers: 0 root, 2 fifth, 4 the root an octave up; the pattern takes two bars).
const bassGroove: Layer = { type: 'tones', inst: 'bass', pattern: '0*3 4 . 2 0*2 | 0*2 2 0 4*2 2 .', octave: 3, vel: 0.8 };

// What we add.
const pulse = (vel: number): Layer => ({ type: 'chord', inst: 'mallet', center: 62, vel, pattern: 'X.x.x.x.' });
const pad: Layer = { type: 'chord', inst: 'pad', center: 60, vel: 0.8 };
const harp = (vel = 0.6): Layer => ({ type: 'tones', inst: 'harp', pattern: '0 2 3 4 5 4 3 2', octave: 3, vel });
const drums: Layer[] = [
  { type: 'beat', inst: 'tom', pattern: 'X..o..o.', vel: 0.8 },
  { type: 'beat', inst: 'shaker', pattern: '.oxo.oxo' },
];
const hatsOnly: Layer[] = [{ type: 'beat', inst: 'shaker', pattern: '.o.o.o.o', vel: 0.8 }];

const owners = (name: string, from: number, layers: Layer[]): Section => {
  const p = part(from);
  return { name, chords: p.chords, lines: p.lines, layers };
};

// The bridge (ours): the tune's first three notes (G A B) lifted into E minor and F♯ minor,
// then home through Gmaj7. Ends on the owner's pickup note (F♯4 on the last step), so it falls
// straight into the tune's first bar, the same way their intro does.
const BRIDGE_CHORDS = 'Em9 | Em9 | F#m7 | F#m7 | Gmaj7 | Gmaj7 | Bm7 A7sus4 | A7sus4 Dmaj7';
const BRIDGE_MELODY =
  'B4*2 D5*2 E5*4 | D5*2 B4*2 G4*4 | A4*2 C#5*2 E5*4 | C#5*2 A4*2 F#4*4 |' +
  'G4*2 A4*2 B4*2 D5*2 | F#5*3 E5 D5*4 | F#5*2 E5*2 D5*2 E5*2 | E5*2 D5*2 C#5*2 A4 F#4';
const BRIDGE_ECHO =
  '.*8 | G5*8 | .*8 | A5*8 | .*8 | B5*6 A5*2 | .*8 | .*8';
const bridgeBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*3 2 0*2 2*2', octave: 2, vel: 0.8 };

export const VALLEY_DAY_SONG: Song = {
  name: 'The Valley Wakes', bpm: 96, stepsPerBeat: midi.stepsPerBeat, beatsPerBar: midi.beatsPerBar, loopFrom: 1,
  sections: [
    // Their bars 1–8: chords and bass alone, the piano only gives the pickup note at the end.
    owners('intro', 0, [pulse(0.5), pad, theirBass, lead]),
    // 9–16: the tune, two piano voices trading the long notes.
    owners('A', 8, [lead, answer, answerBell, pulse(0.55), pad, theirBass, harp(0.5)]),
    // 17–24: the same, with the backing melody entering over it and the drums.
    owners("A'", 16, [lead, answer, answerBell, backing, pulse(0.6), pad, bassGroove, harp(), ...drums]),
    // 25–32: the vamp (C♯–D, A–F♯) four times, building.
    owners('B', 24, [lead, answer, line('bell', 'melody-2', 0.45, 0), backing, line('bell', 'melody', 0.25, 1), pulse(0.65), pad, bassGroove, harp(0.7), ...drums]),
    // Ours: the bridge.
    {
      name: 'C', chords: BRIDGE_CHORDS, melody: BRIDGE_MELODY, lines: { echo: BRIDGE_ECHO },
      layers: [
        { type: 'melody', inst: 'flute', vel: 1 }, { type: 'melody', inst: 'bell', shift: 1, vel: 0.28 },
        line('box', 'echo', 0.45), pulse(0.45), pad, bridgeBass, harp(0.6), ...hatsOnly,
      ],
    },
  ],
};
