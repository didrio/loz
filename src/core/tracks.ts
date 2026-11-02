/**
 * The game's music, written in the notation from `music.ts`. All melodies are original.
 *
 * The owner's harmonic plan (docs/audio.md): everything in the valley revolves around
 * **Gmaj7 → Dmaj7** (G with a lydian lift: the C♯ of Dmaj7 floating over G). Night adds
 * **Gmaj7 Dmaj7 F♯/C♯ Bm**; the Lamplighter's fight is a frantic version of that; the shrine
 * adds **Fmaj7 Dmaj7** and **E♭maj7 Dmaj7** for something stranger and older.
 */
import { compile, type CompiledSong, type Instrument, type Layer, type Song } from './music';

/** Which theme plays: the field by day or night, the village, a boss fight, or a dungeon. */
export type MusicMood = 'day' | 'night' | 'village' | 'boss' | 'shrine';

const melody = (inst: Instrument, shift = 0, vel = 1): Layer => ({ type: 'melody', inst, shift, vel });

// --- Day: "Emberfield" (G, 104 bpm) -------------------------------------------------------
// Gmaj7 → Dmaj7 all the way through: the tune and the arrangement do the travelling. A
// rolling harp, a flute that climbs up to the maj7, then a broader B section with the chords
// held twice as long and a celesta doubling high.

const DAY_A = 'Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7';
const DAY_B = 'Gmaj7 | Gmaj7 | Dmaj7 | Dmaj7 | Gmaj7 | Gmaj7 | Dmaj7 | Dmaj7';
const DAY_MELODY_A =
  'B4*2 D5*2 G5*3 F#5 | E5*2 F#5*2 A5*4 | G5*2 F#5 E5 D5*2 B4*2 | C#5*2 D5*2 A4*4 |' +
  'B4*2 D5*2 G5*2 B5*2 | A5*3 G5 F#5*2 E5*2 | F#5*3 G5 A5*2 B5*2 | A5*6 .*2';
const DAY_MELODY_B =
  'D6*4 C#6*2 B5*2 | G5*8 | F#5*4 E5*2 F#5*2 | A5*6 C#6*2 |' +
  'B5*4 A5*2 G5*2 | F#5*2 G5*2 B5*4 | A5*3 B5 C#6*2 D6*2 | A5*8';

const dayHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0 2 3 4 5 4 3 2', octave: 3, vel: 0.75 };
const dayPad: Layer = { type: 'chord', inst: 'pad', center: 62, vel: 0.75 };
const dayBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*3 2 0*2 2*2', octave: 2 };
const dayDrums: Layer[] = [
  { type: 'beat', inst: 'tom', pattern: 'X..o..o.' },
  { type: 'beat', inst: 'shaker', pattern: '.oxo.oxo' },
];

export const DAY_SONG: Song = {
  name: 'Emberfield', bpm: 104, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Gmaj7 | Dmaj7', layers: [dayHarp, dayPad] },
    { name: 'A', chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), dayHarp, dayPad, dayBass] },
    { name: "A'", chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), melody('harp', -1, 0.4), dayHarp, dayPad, dayBass, ...dayDrums] },
    { name: 'B', chords: DAY_B, melody: DAY_MELODY_B, layers: [melody('flute'), melody('bell', 0, 0.35), dayPad, { ...dayBass, pattern: '0*4 2*4' }, ...dayDrums] },
    { name: "A''", chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), melody('bell', 1, 0.3), dayHarp, dayPad, dayBass, ...dayDrums] },
  ],
};

// --- Thistledown: "Thistledown" (G, 92 bpm) -----------------------------------------------
// The day theme's chords, simpler and homelier: a wooden mallet tune, a soft pad, a walking
// bass, a flute joining the second time round. No drums, no harp.

const VILLAGE_A = 'Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7';
const VILLAGE_MELODY =
  'G5*2 A5*2 B5*4 | A5*2 F#5*2 D5*4 | G5*2 A5*2 B5*2 D6*2 | C#6*4 A5*4 |' +
  'B5*2 A5*2 G5*4 | F#5*2 E5*2 D5*4 | E5*2 F#5*2 G5*2 B5*2 | A5*8';

const villagePad: Layer = { type: 'chord', inst: 'pad', center: 62, vel: 0.6 };
const villageBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*2 2*2 3*2 2*2', octave: 2, vel: 0.7 };

export const VILLAGE_SONG: Song = {
  name: 'Thistledown', bpm: 92, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Gmaj7 | Dmaj7', layers: [villagePad, villageBass] },
    { name: 'A', chords: VILLAGE_A, melody: VILLAGE_MELODY, layers: [melody('mallet'), villagePad, villageBass] },
    { name: "A'", chords: VILLAGE_A, melody: VILLAGE_MELODY, layers: [melody('mallet'), melody('flute', -1, 0.6), villagePad, villageBass] },
  ],
};

// --- Night: "Lanterns Out" (B minor, 72 bpm) ----------------------------------------------
// Gmaj7 Dmaj7 F♯/C♯ Bm: the day's two chords, then the floor drops through F♯ over C♯ into
// B minor. A celesta lullaby, the flute answering an octave down; the bridge holds each
// chord for two bars.

const NIGHT_A = 'Gmaj7 | Dmaj7 | F#/C# | Bm | Gmaj7 | Dmaj7 | F#/C# | Bm';
const NIGHT_B = 'Gmaj7 | Gmaj7 | Dmaj7 | Dmaj7 | F#/C# | F#/C# | Bm | Bm';
const NIGHT_MELODY_A =
  'B5*3 A5 F#5*4 | E5*2 F#5*2 A5*4 | C#6*2 A#5*2 F#5*4 | B5*6 .*2 |' +
  'D6*3 B5 G5*2 F#5*2 | A5*3 F#5 E5*2 D5*2 | C#5*2 F#5*2 A#5*4 | B5*8';
const NIGHT_MELODY_B =
  'F#5*4 G5*2 A5*2 | B5*8 | A5*4 F#5*2 E5*2 | D5*6 .*2 |' +
  'C#5*2 E5*2 F#5*4 | A#5*6 C#6*2 | D6*4 C#6*2 B5*2 | B5*6 .*2';

const nightHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0*2 2*2 3*2 4*2', octave: 3, vel: 0.6 };
const nightPad: Layer = { type: 'chord', inst: 'pad', center: 59, vel: 0.7 };
const nightBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*8', octave: 2, vel: 0.6 };
const nightBed = [nightHarp, nightPad, nightBass];

export const NIGHT_SONG: Song = {
  name: 'Lanterns Out', bpm: 72, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Gmaj7 | Dmaj7', layers: nightBed },
    { name: 'A', chords: NIGHT_A, melody: NIGHT_MELODY_A, layers: [melody('bell'), ...nightBed] },
    { name: "A'", chords: NIGHT_A, melody: NIGHT_MELODY_A, layers: [melody('flute', -1), ...nightBed] },
    { name: 'B', chords: NIGHT_B, melody: NIGHT_MELODY_B, layers: [melody('flute', 0, 0.85), ...nightBed] },
    { name: "A''", chords: NIGHT_A, melody: NIGHT_MELODY_A, layers: [melody('bell'), melody('flute', -1, 0.5), ...nightBed] },
  ],
};

// --- The Lamplighter: "The Lamplighter's Round" (B minor, 152 bpm) ------------------------
// The night progression at a run: Gmaj7 Dmaj7 F♯/C♯ Bm, then Em7 and a hard F♯ pulling
// back to B minor. The bridge twists further: Bm, A, Gmaj7, Em7, then C major (the
// Neapolitan, a half step above home: the floor giving way) before F♯/C♯ and home. Driving
// bass, drums, the music box of its caged wisps, synth brass on top.

const BOSS_A = 'Gmaj7 | Dmaj7 | F#/C# | Bm | Gmaj7 | Dmaj7 | Em7 | F#';
const BOSS_B = 'Bm | A | Gmaj7 | Em7 | Cmaj7 | F#/C# | Bm | F#';
const BOSS_MELODY_A =
  'B5*3 D6 B5*2 F#5*2 | A5*3 F#5 D5*2 C#5*2 | C#5*2 F#5*2 A#5*4 | B5*3 C#6 D6*2 B5*2 |' +
  'G5*3 B5 D6*4 | C#6*3 A5 F#5*4 | E5*2 G5*2 B5*2 D6*2 | C#6*4 A#5*2 F#5*2';
const BOSS_MELODY_B =
  'B5*2 D6*2 F#6*4 | E6*3 C#6 A5*4 | D6*3 B5 G5*2 F#5*2 | G5*3 E5 B5*4 |' +
  'C6*3 B5 G5*2 E5*2 | A#5*3 C#6 F#5*4 | B5*2 D6*2 C#6*2 B5*2 | A#5*6 .*2';

const bossBass: Layer = { type: 'tones', inst: 'drive', pattern: '0 0 3 0 0 3 0 3', octave: 2 };
const bossDrums: Layer[] = [
  { type: 'beat', inst: 'kick', pattern: 'X..xX...' },
  { type: 'beat', inst: 'snare', pattern: '..X...X.' },
  { type: 'beat', inst: 'hat', pattern: 'oxoxoxox' },
];
const bossBox: Layer = { type: 'tones', inst: 'box', pattern: '4*2 2*2 3*2 2*2', octave: 4, vel: 0.5 };
const bossPad: Layer = { type: 'chord', inst: 'pad', center: 57, vel: 0.7 };
const brass = melody('brass', -1);

export const BOSS_SONG: Song = {
  name: "The Lamplighter's Round", bpm: 152, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Bm | F#', layers: [bossBass, ...bossDrums] },
    { name: 'A', chords: BOSS_A, layers: [bossBass, ...bossDrums, bossBox, bossPad] },
    { name: "A'", chords: BOSS_A, melody: BOSS_MELODY_A, layers: [brass, bossBass, ...bossDrums, bossPad] },
    { name: 'B', chords: BOSS_B, melody: BOSS_MELODY_B, layers: [brass, melody('box', 0, 0.35), bossBass, ...bossDrums, bossPad] },
  ],
};

// --- The Waking Shrine: "The Sleeping Stones" (G, 80 bpm) ---------------------------------
// The valley's Gmaj7 → Dmaj7, but each return to D comes from somewhere stranger: Fmaj7
// (F natural sliding up to F♯) and E♭maj7 (a world a half step off). A celesta finds its way
// first, the flute answers; the bridge lingers on the strange chords. A wooden mallet like
// footsteps on stone, a low drum like something breathing below.

const SHRINE_A = 'Gmaj7 | Dmaj7 | Fmaj7 | Dmaj7 | Ebmaj7 | Dmaj7 | Gmaj7 | Dmaj7';
const SHRINE_B = 'Fmaj7 | Fmaj7 | Ebmaj7 | Ebmaj7 | Gmaj7 | Gmaj7 | Dmaj7 | Dmaj7';
const SHRINE_MELODY_A =
  'D5*2 F#5*2 B5*4 | A5*2 C#6*2 F#5*4 | E5*2 A5*2 C6*4 | C#6*3 A5 F#5*4 |' +
  'D5*2 G5*2 Bb5*4 | A5*3 F#5 D5*4 | B4*2 D5*2 F#5*2 A5*2 | F#5*6 .*2';
const SHRINE_MELODY_A2 =
  'B5*3 A5 F#5*2 D5*2 | E5*3 F#5 A5*4 | G5*3 F5 E5*2 C5*2 | D5*3 E5 F#5*4 |' +
  'G5*3 F5 Eb5*2 Bb4*2 | C#5*3 D5 E5*4 | F#5*2 G5*2 B5*2 D6*2 | C#6*6 .*2';
const SHRINE_MELODY_B =
  'C6*4 A5*2 E5*2 | F5*8 | D6*4 Bb5*2 G5*2 | Eb5*8 |' +
  'F#5*4 G5*2 A5*2 | B5*8 | A5*4 C#6*2 E6*2 | D6*8';

const shrinePad: Layer = { type: 'chord', inst: 'pad', center: 60, vel: 0.7 };
const shrineHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0*2 2*2 3*2 4*2', octave: 3, vel: 0.5 };
const shrineBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*8', octave: 2, vel: 0.55 };
const shrineMallet: Layer = { type: 'tones', inst: 'mallet', pattern: '0 . 2 3 . 2 1 .', octave: 4, vel: 0.6 };
const shrineBreath: Layer = { type: 'beat', inst: 'tom', pattern: 'X...o...', vel: 0.45 };

export const SHRINE_SONG: Song = {
  name: 'The Sleeping Stones', bpm: 80, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Gmaj7 | Dmaj7', layers: [shrinePad, shrineHarp] },
    { name: 'A', chords: SHRINE_A, melody: SHRINE_MELODY_A, layers: [melody('bell'), shrinePad, shrineHarp, shrineBass] },
    { name: "A'", chords: SHRINE_A, melody: SHRINE_MELODY_A2, layers: [melody('flute'), shrinePad, shrineMallet, shrineBass, shrineBreath] },
    { name: 'B', chords: SHRINE_B, melody: SHRINE_MELODY_B, layers: [melody('flute'), melody('bell', 1, 0.3), shrinePad, shrineMallet, { ...shrineBass, pattern: '0*4 2*4' }, shrineBreath] },
    { name: "A''", chords: SHRINE_A, melody: SHRINE_MELODY_A, layers: [melody('bell'), melody('flute', -1, 0.5), shrinePad, shrineMallet, shrineHarp, shrineBass, shrineBreath] },
  ],
};

export const SONGS: Record<MusicMood, Song> = { day: DAY_SONG, night: NIGHT_SONG, village: VILLAGE_SONG, boss: BOSS_SONG, shrine: SHRINE_SONG };

const compiled: Partial<Record<MusicMood, CompiledSong>> = {};

/** Compiled on first use (a few thousand events each; cheap, but not needed at import time). */
export function compiledSong(mood: MusicMood): CompiledSong {
  return (compiled[mood] ??= compile(SONGS[mood]));
}
