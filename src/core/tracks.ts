/**
 * The game's music, written in the notation from `music.ts`. All melodies are original.
 *
 * Every song shares one motif, the day theme's first bar (A–D–E–F♯): reharmonized darker
 * at night, a honky-tonk two-step in Thistledown, a frantic B minor run for the Lamplighter,
 * and made exotic (A–D–E♭–F♯, phrygian dominant) in the Waking Shrine.
 */
import { compile, type CompiledSong, type Instrument, type Layer, type Song } from './music';
import { VALLEY_DAY_SONG } from './valleyTheme';

/** Which theme plays: the field by day or night, the village, a boss fight, or a dungeon. */
export type MusicMood = 'day' | 'night' | 'village' | 'boss' | 'shrine' | 'warden' | 'blight' | 'blightNight' | 'blightVillage';
/** Boss fights' songs: they crossfade in fast, with the fight. */
export const BOSS_MOODS: ReadonlySet<MusicMood> = new Set<MusicMood>(['boss', 'warden']);

const melody = (inst: Instrument, shift = 0, vel = 1): Layer => ({ type: 'melody', inst, shift, vel });

// --- Day: "Over the Ember Hills" (D major, 100 bpm) ----------------------------------------
// Bittersweet but setting out: the motif (bar 1: A–D–E–F♯, a fourth up then two steps) over
// Dmaj9, the bass walking down D B G E to F♯, a B7 nudging toward the IV, and the borrowed
// G minor 6th in bar 7 that gives it the ache. The bridge's bass falls B A G F♯, then it
// climbs and lands through B♭maj7 and C9 on D (the old "heroic" cadence). Rolling harp, a flute,
// frame drum and shaker from the second verse, celesta doubling high.
// The night and village songs keep this tune and change what's under it.

const DAY_A = 'Dmaj9 | Bm9 | Gmaj9 | Em9 A7 | D/F# | F#m7 B7 | Gmaj7 Gm6 | Dmaj7 A7sus4';
const DAY_B = 'Bm Bm/A | Gmaj9 | D/F# | Asus4 A | Bm7 E7 | Gmaj9 | Bbmaj7 C9 | Dsus4 Dadd9';
const DAY_MELODY_A =
  'A4*2 D5*2 E5 F#5*3 | E5*2 D5*2 B4*4 | D5*2 F#5*2 A5*3 G5 | E5*6 C#5*2 |' +
  'A4*2 D5*2 F#5*2 A5*2 | A5*2 C#6*2 B5 A5*3 | B5*2 G5*2 Bb5*3 A5 | F#5*6 .*2';
const DAY_MELODY_B_START =
  'D6*4 C#6*2 B5*2 | G5*2 A5*2 F#5*4 | A5*3 B5 A5*2 F#5*2 | E5*4 C#5*2 E5*2 |' +
  'D6*3 E6 F#6*2 D6*2 | D6*4 B5*2 G5*2 |';
const DAY_MELODY_B = DAY_MELODY_B_START + 'F5*2 D5*2 E5*2 G5*2 | G5*4 F#5*4';

const dayHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0 2 3 4 5 4 3 2', octave: 3, vel: 0.75 };
const dayPad: Layer = { type: 'chord', inst: 'pad', center: 62, vel: 0.75 };
const dayBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*3 2 0*2 2*2', octave: 2, vel: 0.8 };
const dayDrums: Layer[] = [
  { type: 'beat', inst: 'tom', pattern: 'X..o..o.' },
  { type: 'beat', inst: 'shaker', pattern: '.oxo.oxo' },
];

export const DAY_SONG: Song = {
  name: 'Over the Ember Hills', bpm: 100, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Dmaj9 | Gmaj9', layers: [dayHarp, dayPad] },
    { name: 'A', chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), dayHarp, dayPad, dayBass] },
    { name: "A'", chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), melody('harp', -1, 0.4), dayHarp, dayPad, dayBass, ...dayDrums] },
    { name: 'B', chords: DAY_B, melody: DAY_MELODY_B, layers: [melody('flute'), melody('bell', 0, 0.35), dayPad, { ...dayBass, pattern: '0*4 2*4' }, ...dayDrums] },
    { name: "A''", chords: DAY_A, melody: DAY_MELODY_A, layers: [melody('flute'), melody('bell', 1, 0.3), dayHarp, dayPad, dayBass, ...dayDrums] },
  ],
};

// --- Thistledown: "Thistledown Two-Step" (D major, 116 bpm, swung) ------------------------
// The day tune simplified for a saloon upright: a blue F♮ leaning into the motif's F♯, 6th
// chords, an E9 and a B7 as secondary dominants, diminished chords sliding between them,
// the minor iv (Gm6), and a stride left hand (bass on 1 and 3, chord stabs on 2 and 4).

const VILLAGE_A = 'D6 | Bm7 E9 | G6 G#dim7 | A7 | D6 D#dim7 | F#m7 B7 | Em9 A7 | D6 A7';
const VILLAGE_B = 'G6 Gm6 | G#dim7 | D6/A | B9 | Em9 | Bbdim7 A7 | D6 Bm7 | A7';
const VILLAGE_MELODY_A =
  'A4*2 D5*2 F5 F#5*3 | E5*2 D5*2 B4*4 | D5*2 G5*2 B5*4 | A5*2 G5*2 E5*4 |' +
  'A4*2 D5*2 F#5*2 A5*2 | A5*2 F#5*2 D#5*4 | G5*2 E5*2 C#5*2 E5*2 | D5*4 .*2 A4*2';
const VILLAGE_MELODY_B =
  'B5*2 A5*2 G5*2 E5*2 | G#5*2 B5*2 D6*4 | F#5*3 E5 F#5*2 A5*2 | D#5*2 F#5*2 A5*4 |' +
  'G5*3 F#5 E5*4 | C#5*2 E5*2 G5*4 | F#5*2 E5*2 D5*2 B4*2 | C#5*4 E5*2 .*2';

const stride: Layer[] = [
  { type: 'tones', inst: 'piano', pattern: '0*2 . . 2*2 . .', octave: 2, vel: 0.8 },
  { type: 'tones', inst: 'piano', pattern: '. . 1 . . . 1 .', octave: 3, vel: 0.45 },
  { type: 'tones', inst: 'piano', pattern: '. . 2 . . . 2 .', octave: 3, vel: 0.45 },
  { type: 'tones', inst: 'piano', pattern: '. . 3 . . . 3 .', octave: 3, vel: 0.45 },
];
const villageHat: Layer = { type: 'beat', inst: 'hat', pattern: 'x.o.x.o.', vel: 0.5 };

export const VILLAGE_SONG: Song = {
  name: 'Thistledown Two-Step', bpm: 116, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1, swing: 0.3,
  sections: [
    { name: 'intro', chords: 'D6 | A7', layers: stride },
    { name: 'A', chords: VILLAGE_A, melody: VILLAGE_MELODY_A, layers: [melody('piano'), ...stride, villageHat] },
    { name: "A'", chords: VILLAGE_A, melody: VILLAGE_MELODY_A, layers: [melody('piano'), melody('mallet', 1, 0.5), ...stride, villageHat] },
    { name: 'B', chords: VILLAGE_B, melody: VILLAGE_MELODY_B, layers: [melody('piano'), ...stride, villageHat, { type: 'tones', inst: 'bass', pattern: '0*2 2*2 3*2 2*2', octave: 2, vel: 0.6 }] },
  ],
};

// --- Night: "Where the Lanterns Sleep" (B minor, 76 bpm) ----------------------------------
// The day tune, reharmonized in the dark: the motif opens over B minor 9, bar 3's line floats
// over Cmaj9 (the lydian ♯11), a half-diminished ii and F♯7♭9 pull home, and bar 6 hangs on
// Fmaj7♯5 (the tritone away: the eeriest chord in the valley). The bridge's bass falls
// B A G F♯ (a lament), the B♭–C cadence turns into Cmaj7–F♯7♭9 (the Neapolitan C, the floor
// giving way), and it lands on B minor-major 7 sighing G → F♯ into plain B minor.
// A celesta lullaby, the flute answering an octave down.

const NIGHT_A = 'Bm9 | Em9 | Cmaj9 | C#m7b5 F#7b9 | Gmaj9 | Fmaj7#5 | Em9 Gm6 | F#sus4 F#7';
const NIGHT_B = 'Gmaj7 | Em9 | Bm Bm/A | Gmaj7 F#7b9 | Em9 | Cmaj9 | Cmaj7 F#7b9 | Bmmaj7 Bm';
const NIGHT_MELODY_B = DAY_MELODY_B_START + 'E5*2 C5*2 E5*2 A#5*2 | G5*4 F#5*4';

const nightHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0*2 2*2 3*2 4*2', octave: 3, vel: 0.6 };
const nightPad: Layer = { type: 'chord', inst: 'pad', center: 59, vel: 0.7 };
const nightBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*8', octave: 2, vel: 0.5 };
const nightBed = [nightHarp, nightPad, nightBass];

export const NIGHT_SONG: Song = {
  name: 'Where the Lanterns Sleep', bpm: 76, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Bm9 | Gmaj9', layers: nightBed },
    { name: 'A', chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('bell'), ...nightBed] },
    { name: "A'", chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('flute', -1), ...nightBed] },
    { name: 'B', chords: NIGHT_B, melody: NIGHT_MELODY_B, layers: [melody('flute', 0, 0.85), ...nightBed] },
    { name: "A''", chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('bell'), melody('flute', -1, 0.5), ...nightBed] },
  ],
};

// --- The Lamplighter: "The Lamplighter's Round" (B minor, 152 bpm) ------------------------
// The valley's motif in the night key at a run: F♯–B–C♯–D (the same fourth and two steps),
// over Bm, Gmaj7, Em9 and a hard F♯7♭9. The bridge flashes the day motif itself, bright in
// D, then drops through C major (the Neapolitan, a half step above home: the floor giving
// way) to F♯7♭9 and a falling Bm–Bm/A. Driving bass, drums, the music box of its caged
// wisps, synth brass on top.

const BOSS_A = 'Bm | Gmaj7 | Em9 | F#7b9 | Bm | D/A | Gmaj7 C#m7b5 | F#7b9';
const BOSS_B = 'Em9 | A7 | Dmaj7 | Gmaj7 | Cmaj7 | F#7b9 | Bm Bm/A | G6 F#7b9';
const BOSS_MELODY_A =
  'F#5*2 B5*2 C#6 D6*3 | C#6*2 B5*2 F#5*4 | B5*2 D6*2 F#6*3 E6 | C#6*6 A#5*2 |' +
  'F#5*2 B5*2 D6*2 F#6*2 | F#6*2 E6*2 D6 C#6*3 | D6*2 B5*2 G5*3 E5 | F#5*2 G5*2 A#5*2 C#6*2';
const BOSS_MELODY_B =
  'B5*2 E6*2 F#6*4 | E6*3 C#6 A5*4 | A5*2 D6*2 E6 F#6*3 | E6*2 D6*2 B5*4 |' +
  'G5*2 C6*2 E6*3 D6 | C#6*4 A#5*2 G5*2 | F#5*2 B5*2 C#6*2 D6*2 | E6*2 D6*2 C#6*2 A#5*2';

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
    { name: 'intro', chords: 'Bm | F#7b9', layers: [bossBass, ...bossDrums] },
    { name: 'A', chords: BOSS_A, melody: BOSS_MELODY_A, layers: [melody('box', 0, 0.45), bossBass, ...bossDrums, bossBox, bossPad] },
    { name: "A'", chords: BOSS_A, melody: BOSS_MELODY_A, layers: [brass, bossBass, ...bossDrums, bossPad] },
    { name: 'B', chords: BOSS_B, melody: BOSS_MELODY_B, layers: [brass, melody('box', 0, 0.35), bossBass, ...bossDrums, bossPad] },
  ],
};

// --- The Waking Shrine: "The Sleeping Stones" (D phrygian dominant, 80 bpm) ---------------
// The valley's motif made strange: A–D–E♭–F♯, the step turned into an augmented second (the
// scale of old temples: D E♭ F♯ G A B♭ C). E♭maj7 a half step above home, G minor-major 7,
// a B♭maj7♯5 that never settles, and D7♭9 pulling back. The bridge lands on the day song's
// own last sigh (G → F♯ over Dsus4 → D): the shrine remembers the valley. A celesta finds its
// way first, the flute answers; a wooden mallet like footsteps on stone, a low drum like
// something breathing below.

const SHRINE_A = 'D | Ebmaj7 | Gmmaj7 | Cm6 D7b9 | D | Bbmaj7#5 | Gm6 Ebmaj7 | D';
const SHRINE_B = 'Ebmaj7 | D | Cm9 | Gmmaj7 | Ebmaj7 | Bbmaj7#5 | Cm6 D7b9 | Dsus4 D';
const SHRINE_MELODY_A =
  'A4*2 D5*2 Eb5 F#5*3 | Eb5*2 D5*2 Bb4*4 | D5*2 F#5*2 A5*3 G5 | Eb5*6 C5*2 |' +
  'A4*2 D5*2 F#5*2 A5*2 | A5*2 Bb5*2 A5 F#5*3 | Bb5*2 G5*2 Bb5*3 A5 | Eb5*2 F#5*4 .*2';
const SHRINE_MELODY_B =
  'D6*4 C6*2 Bb5*2 | G5*2 Eb5*2 F#5*4 | G5*3 Bb5 D6*2 Eb6*2 | D6*4 Bb5*2 F#5*2 |' +
  'Bb5*3 C6 D6*2 Bb5*2 | A5*4 F#5*2 D5*2 | Eb5*2 C5*2 Eb5*2 F#5*2 | G5*4 F#5*4';

const shrinePad: Layer = { type: 'chord', inst: 'pad', center: 60, vel: 0.7 };
const shrineHarp: Layer = { type: 'tones', inst: 'harp', pattern: '0*2 2*2 3*2 4*2', octave: 3, vel: 0.5 };
const shrineBass: Layer = { type: 'tones', inst: 'bass', pattern: '0*8', octave: 2, vel: 0.55 };
const shrineMallet: Layer = { type: 'tones', inst: 'mallet', pattern: '0 . 2 3 . 2 1 .', octave: 4, vel: 0.6 };
const shrineBreath: Layer = { type: 'beat', inst: 'tom', pattern: 'X...o...', vel: 0.45 };

export const SHRINE_SONG: Song = {
  name: 'The Sleeping Stones', bpm: 80, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'D | Ebmaj7', layers: [shrinePad, shrineHarp] },
    { name: 'A', chords: SHRINE_A, melody: SHRINE_MELODY_A, layers: [melody('bell'), shrinePad, shrineHarp, shrineBass] },
    { name: "A'", chords: SHRINE_A, melody: SHRINE_MELODY_A, layers: [melody('flute'), melody('box', 1, 0.25), shrinePad, shrineMallet, shrineBass, shrineBreath] },
    { name: 'B', chords: SHRINE_B, melody: SHRINE_MELODY_B, layers: [melody('flute'), melody('bell', 1, 0.3), shrinePad, shrineMallet, { ...shrineBass, pattern: '0*4 2*4' }, shrineBreath] },
    { name: "A''", chords: SHRINE_A, melody: SHRINE_MELODY_A, layers: [melody('bell'), melody('flute', -1, 0.5), shrinePad, shrineMallet, shrineHarp, shrineBass, shrineBreath] },
  ],
};

// --- Gravelheart: "The Warden's Vigil" (D phrygian dominant, 128 bpm) ------------------------
// The shrine's own progression, stood up and made to fight: the motif (A–D–E♭–F♯) at a run, over
// the same E♭maj7 / Gmmaj7 / B♭maj7♯5 colors and a D7♭9 that keeps pulling at the cord. Heavy
// drive bass and drums, bells and a flute in the first verse, synth brass when it rises.

const WARDEN_A = 'D | Ebmaj7 | Gmmaj7 D7b9 | Cm6 D7b9 | D | Bbmaj7#5 | Gm6 Ebmaj7 | D7b9';
const WARDEN_B = 'Ebmaj7 | D | Cm9 | Gmmaj7 | Ebmaj7 | Bbmaj7#5 | Cm6 D7b9 | Dsus4 D7b9';
const WARDEN_MELODY_A =
  'A4 D5 Eb5 F#5 Eb5 D5 Bb4 A4 | G4*2 Bb4 D5 Eb5*2 D5 Bb4 | D5 F#5 A5 G5 F#5 Eb5 D5 C5 | Bb4 C5 D5*2 A4*4 |' +
  'A4 D5 Eb5 F#5 A5 F#5 Eb5 D5 | D5*2 Bb5 A5 G5*2 F#5 Eb5 | Bb5 A5 G5 Bb5 A5 G5 Eb5 F#5 | D5*4 Eb5*2 F#5*2';
const WARDEN_MELODY_B =
  'G5*2 Bb5*2 D6*4 | C6*2 Bb5*2 A5*4 | G5 Bb5 D6 Eb6 D6 Bb5 G5 Eb5 | D5*2 F#5*2 A5*4 |' +
  'Eb6*2 D6*2 Bb5*4 | A5 Bb5 D6 F#6 A6*2 F#6*2 | G6 F#6 Eb6 D6 C6 Bb5 A5 F#5 | D6*4 .*2 A5 Bb5';
const wardenBass: Layer = { type: 'tones', inst: 'drive', pattern: '0 0 . 0 0 . 3 0', octave: 2 };
const wardenDrums: Layer[] = [
  { type: 'beat', inst: 'kick', pattern: 'X..xX..x' },
  { type: 'beat', inst: 'snare', pattern: '..X...X.' },
  { type: 'beat', inst: 'tom', pattern: '.o.o..o.', vel: 0.5 },
];

export const WARDEN_SONG: Song = {
  name: "The Warden's Vigil", bpm: 128, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'D | D7b9', layers: [wardenBass, ...wardenDrums] },
    { name: 'A', chords: WARDEN_A, melody: WARDEN_MELODY_A, layers: [melody('bell'), melody('flute', 0, 0.5), wardenBass, ...wardenDrums, shrinePad] },
    { name: "A'", chords: WARDEN_A, melody: WARDEN_MELODY_A, layers: [brass, wardenBass, ...wardenDrums, shrinePad] },
    { name: 'B', chords: WARDEN_B, melody: WARDEN_MELODY_B, layers: [brass, melody('bell', 0, 0.35), wardenBass, ...wardenDrums, shrinePad] },
  ],
};

// --- The blight: three placeholders (the owner listens and judges) -------------------------
// The valley's tune while the blight lies on it, and until the seal breaks. Each keeps its
// song's melody and strips what made it warm: slower, a music box or a lone bell for a lead,
// a pad instead of the harp and drums, no swing in the village.

const blightBed: Layer[] = [
  { type: 'chord', inst: 'pad', center: 57, vel: 0.65 },
  { type: 'tones', inst: 'bass', pattern: '0*8', octave: 2, vel: 0.4 },
];

export const BLIGHT_SONG: Song = {
  name: 'Ash on the Hills', bpm: 78, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Bm9 | Gmaj9', layers: blightBed },
    { name: 'A', chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('box'), ...blightBed] },
    { name: "A'", chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('box'), melody('flute', -1, 0.4), ...blightBed] },
  ],
};

export const BLIGHT_NIGHT_SONG: Song = {
  name: 'Nobody Sleeps', bpm: 62, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'Bm9 | Cmaj9', layers: blightBed },
    { name: 'A', chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('bell', -1, 0.8), ...blightBed] },
    { name: "A'", chords: NIGHT_A, melody: DAY_MELODY_A, layers: [melody('bell', -1, 0.8), melody('flute', -1, 0.35), ...blightBed] },
  ],
};

/** Almost nothing under it: a lone piano and a faint pad, so it feels like a village holding its breath. */
const hushedBed: Layer[] = [{ type: 'chord', inst: 'pad', center: 60, vel: 0.28 }];

export const BLIGHT_VILLAGE_SONG: Song = {
  name: 'Thistledown, Doors Shut', bpm: 68, stepsPerBeat: 2, beatsPerBar: 4, loopFrom: 1,
  sections: [
    { name: 'intro', chords: 'D6 | A7', layers: hushedBed },
    { name: 'A', chords: VILLAGE_A, melody: VILLAGE_MELODY_A, layers: [melody('piano', 0, 0.7), ...hushedBed] },
    { name: "A'", chords: VILLAGE_A, melody: VILLAGE_MELODY_A, layers: [melody('piano', 0, 0.6), melody('box', 1, 0.2), ...hushedBed] },
  ],
};

/**
 * The field's day theme: any of these can play. Nothing is ever deleted, so a song we move
 * away from stays one line away. Change `ACTIVE_DAY` to switch.
 */
export const DAY_SONGS = { 'ember-hills': DAY_SONG, 'valley-wakes': VALLEY_DAY_SONG } as const;
export const ACTIVE_DAY: keyof typeof DAY_SONGS = 'ember-hills';

export const SONGS: Record<MusicMood, Song> = { day: DAY_SONGS[ACTIVE_DAY], night: NIGHT_SONG, village: VILLAGE_SONG, boss: BOSS_SONG, shrine: SHRINE_SONG, warden: WARDEN_SONG,
  blight: BLIGHT_SONG, blightNight: BLIGHT_NIGHT_SONG, blightVillage: BLIGHT_VILLAGE_SONG };

const compiled: Partial<Record<MusicMood, CompiledSong>> = {};

/** Compiled on first use (a few thousand events each; cheap, but not needed at import time). */
export function compiledSong(mood: MusicMood): CompiledSong {
  return (compiled[mood] ??= compile(SONGS[mood]));
}
