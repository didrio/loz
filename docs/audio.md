# Audio

Everything is synthesized with Web Audio: no samples, no recordings, all melodies original
(write in the *style* of late-90s adventure scores; never quote an existing game's tune).
Sound effects are small functions in `core/audio.ts` (`Sfx`); background music is data
played by `core/synth.ts`. An agent can't hear any of it: render to WAV, measure levels,
and ask the owner to listen.

**Murmurbuds** (`budTap(growth)`, `nuhUh`, `budOpen`): a soft triangle knock that climbs with
the bud's growth; "nuh-uh", two falling square blips (G4 then D4); a rising A-major arpeggio
with a breath of noise as it opens. Not yet heard by the owner.

**The keepers' bells** (`Sfx.bell(freq, gain, delay)`, [bells.md](bells.md)): a cast bell
from sine partials at bell ratios (hum 0.5, prime 1, minor tierce 1.19, quint 1.5, nominal 2,
then 2.52, 3.01, 4.1), the high ones dying first (4.5 s down to 0.7 s), plus a short noise tick
for the clapper. The Morrowbell rings A4 (440 Hz), the Lullbell D4 (293.66 Hz): a fifth apart in
the valley's key, so two bells answering each other sound like the day tune's opening fourth
turned around. A far bell answering is the same call at `gain` 0.3 with a delay. Not yet heard
by the owner.

## Music (`core/music.ts`, `core/synth.ts`, `core/tracks.ts`)

Songs are written as data, like an arrangement in a DAW: **sections** (intro, A, A', B...)
end to end, each with a chord line (`F | Am | Dm Gm | C`), an optional hand-written
melody (`C5*2 F5*3 G5 A5*2 | ...`, `*n` = steps, `.` = rest; a step is an eighth note) and
**layers**: the melody on an instrument (optionally octave-shifted), or patterns that
follow the chords (`tones`: chord-tone numbers like an arpeggiator; `chord`: a held pad
voiced near a center note; `beat`: drums, `X x o .`). Every bar must add up exactly, or
`compile` throws (tests catch miscounted melodies). A song loops back to `loopFrom`
(after the intro). Instruments: flute, bell (celesta), box (detuned music box), harp, pad,
bass, drive (boss bass), brass, mallet (soft marimba-like wood), piano (a detuned honky-tonk
upright), keys (a clean soft piano that rings down by itself), kick, snare, hat, shaker, tom. `Song.swing` (0–0.5) delays every off-beat step
for a shuffle. Chord names: `C`, `Cm`, `C7`, `Cm7`, `Cmaj7`, `C6`, `Cm6`, `Cadd9`, `Cmaj9`, `Cm9`, `C9`,
`C7sus4`, `C7b9`, `Cm7b5`, `Cdim7`, `Cmmaj7`, `Cmaj7#5`, `Csus4`, `Csus2`, `Cdim` (with `#`/`b`);
add a quality to `QUALITIES` in `music.ts` when a song needs one (no music library needed).

**Ties and extra lines**: `B4^*3 | B4*8` ties a note over a bar line (one long note). A section can hold
more named lines (`Section.lines`), played by `{ type: 'melody', line: 'name' }` layers (a second voice, the
owner's bass). A `chord` layer with a bar `pattern` (`X.x.x.x.`) re-strikes the chord at each hit. `sliceBars(line, from, count)`
cuts a section's part out of a long line.

**Which theme plays** (`Game.updateWorld`): the engaged boss's theme (`Boss.music`) (its
entrance cutscene plays in silence: the encounter script calls `silenceMusic(true)` as the
trap springs and `false` right after `engage()`, so the song starts with the fight);
otherwise the area's own theme (`Area.music`, e.g. a dungeon's `DungeonDef.music`);
otherwise a theme for that part of the area (`Area.musicAt`: Thistledown by day);
otherwise the field's day or night theme. (The "flute" is only a music instrument; there is no flute in the game.)

`MusicPlayer` schedules notes 0.25 s ahead on the **audio clock** (music follows real time,
not game time, so slow motion doesn't drag the tempo), crossfades songs (2.5 s day/night,
0.6 s for the boss), skips ahead after a hidden tab, and runs on an `OfflineAudioContext`
too, so a scratch script can render songs to WAV and measure levels (import
`/src/core/synth.ts` and `/src/core/tracks.ts` in a page served by the dev server).

**Mix targets**: the melody at least as loud (RMS) as the bass, the music peaking ~0.1–0.2
in the game's output so it stays under sound effects.

## One tune for the valley

The owner's earlier Gmaj7 → Dmaj7 plan was retired on 2026-11-02 (owner's call: new
compositions, free harmony). The valley's three songs share **one melody**, the day
theme's (the alternate day song "The Valley Wakes" has its own tune, so night and village would need reworking if it ever becomes the active one): the motif is its first bar (A–D–E–F♯, a fourth up then two steps). Night keeps the
tune and darkens the chords under it. Thistledown plays it simplified as a honky-tonk
two-step. A new area theme should take this motif somewhere new rather than start from
nothing. The Lamplighter's fight and the shrine are built on it too (B minor at a run; phrygian
dominant).

Music always plays, except during death: it stops dead, a falling "defeat" figure plays
(`Sfx.defeat`), the screen goes black, Wren respawns and the theme starts again from the
top (`ScriptApi.silenceMusic`, used by the `death` script). Silence cuts in at once (0.12 s), the boss theme crossfades in 0.6 s, day and night in 2.5 s.
If the browser suspends audio,
`Sfx.updateMusic` resumes it.

## Importing the owner's music (MIDI → arrangement)

The owner writes in Ableton and exports MIDI; we arrange around it. **Their notes are followed as written; the
instruments, drums, intro/build/bridge around them are ours.**

1. **Export**: one `.mid` per part into `assets/music-src/<song-folder>/`. Names decide the role: a file with
   `chord` in its name is the chords, `bass` the bass, anything else a melody line (named after the file).
   Overlapping notes in a file become extra voices (`melody`, `melody-2`); one file with several named
   tracks also works. No tempo needed (Ableton leaves it out); 4/4 only for now.
2. **Import**: `npm run midi -- <song-folder>` (add `--steps 4` for sixteenth-note detail) writes
   `src/core/imported/<song-folder>.ts` (**generated, never edit**) and prints what it found: lines, bar counts,
   chords per bar (named from the notes), and notes that were off the grid (quantized to eighths by default).
   A note held one step too long is trimmed, not made a new voice.
3. **Arrange**: a file like `core/valleyTheme.ts` cuts the imported lines into sections with `sliceBars`, picks
   instruments, adds drums and a bridge, and sets `bpm`. Re-exporting the MIDI and re-running step 2 updates the
   notes without touching the arrangement.
4. **Switch**: `DAY_SONGS` / `ACTIVE_DAY` in `tracks.ts` choose which day song plays (`'ember-hills'` today). Songs we move away from stay in the code and tested.

**The first import ("The Valley Wakes", `valleyTheme.ts`)** is the worked example and a record of the owner's taste.
Their notes ran 32 bars (an 8-bar chords-and-bass intro, the tune, the tune with the backing melody, a C♯–D vamp);
we added an 8-bar bridge that ends on their F♯4 pickup so the loop closes. Owner's feedback, which holds for
the next import: their "melody" track is a **piano** whose notes don't sustain (hence the `keys` instrument,
not the sustained flute we first used); their "backing melody" is a **held flute** (not a staccato box); they like
the bass **more interesting** than long roots (so from the second verse a groove keeps their roots on the downbeats).
Tempo was our guess (96); the owner approved it. Instruments are ours to choose, but ask which sound the
owner had in mind for a part, and match how long its notes ring.

Code: `core/midiFile.ts` (reader), `core/midiImport.ts` (quantize, voices, lines, chord names; tested in
`midiImport.test.ts`), `scripts/midi-import.mjs` (the CLI).

## Themes (`core/tracks.ts`)

| Mood | Song | Key / tempo | Progression | Sound |
|---|---|---|---|---|
| `day` (active, `ember-hills`) | Over the Ember Hills | D, 100 | A: Dmaj9 Bm9 Gmaj9 Em9·A7 D/F♯ F♯m7·B7 Gmaj7·Gm6 Dmaj7·A7sus4; B: Bm·Bm/A Gmaj9 D/F♯ Asus4·A Bm7·E7 Gmaj9 B♭maj7·C9 Dsus4·Dadd9 | harp, flute, frame drum and shaker from the 2nd verse, celesta doubling. Bittersweet from the borrowed Gm6 and the B♭–C–D cadence |
| `day` (alternate, `valley-wakes`, not active) | The Valley Wakes (`core/valleyTheme.ts`) | G/D lydian-ish (Gmaj7 ↔ Dmaj7 two bars each), 96 (our guess; the file has no tempo) | the owner's (melody on `keys`, backing melody on a held flute, bass groove from the 2nd verse): Gmaj7 ×2 · Dmaj7 ×2, struck every beat; our bridge: Em9 F♯m7 Gmaj7 Bm7·A7sus4 A7sus4·Dmaj7 | 32 owner bars (intro, the tune in two flute voices, backing melody + drums, the C♯–D vamp) + our 8-bar bridge. Unheard by the author: ask the owner to listen. Owner's verdict so far: "not bad"; kept as an alternate, to try again later |
| `village` | Thistledown Two-Step | D, 116, swing 0.3 | A: D6 Bm7·E9 G6·G♯dim7 A7 D6·D♯dim7 F♯m7·B7 Em9·A7 D6·A7; B: G6·Gm6 G♯dim7 D6/A B9 Em9 B♭dim7·A7 D6·Bm7 A7 | the day tune with a blue F♮: honky-tonk piano over a stride left hand, soft hat, mallet doubling the 2nd time; plays in Thistledown by day (`Overworld.musicAt`) |
| `night` | Where the Lanterns Sleep | B minor, 76 | A: Bm9 Em9 Cmaj9 C♯m7♭5·F♯7♭9 Gmaj9 Fmaj7♯5 Em9·Gm6 F♯sus4·F♯7; B: Gmaj7 Em9 Bm·Bm/A Gmaj7·F♯7♭9 Em9 Cmaj9 Cmaj7·F♯7♭9 Bmmaj7·Bm | the day tune reharmonized: celesta lullaby, flute an octave down, slow harp |
| `boss` | The Lamplighter's Round | B minor, 152 | A: Bm Gmaj7 Em9 F♯7♭9 Bm D/A Gmaj7·C♯m7♭5 F♯7♭9; B: Em9 A7 Dmaj7 Gmaj7 Cmaj7 (Neapolitan) F♯7♭9 Bm·Bm/A G6·F♯7♭9 | the motif in B minor at a run (F♯–B–C♯–D), the day motif flashing by in the bridge; driving bass and drums, music box, synth brass. Silent during its entrance; starts with the fight |
| `warden` | The Warden's Vigil | D phrygian dominant, 128 | A: D E♭maj7 Gmmaj7·D7♭9 Cm6·D7♭9 D B♭maj7♯5 Gm6·E♭maj7 D7♭9; B: E♭maj7 D Cm9 Gmmaj7 E♭maj7 B♭maj7♯5 Cm6·D7♭9 Dsus4·D7♭9 | Gravelheart's fight: the shrine's colors stood up to fight, the motif (A–D–E♭–F♯) at a run; drive bass, kick/snare/tom, bell and flute then synth brass. Unheard by the author: ask the owner to listen |
| `shrine` | The Sleeping Stones | D phrygian dominant, 80 | A: D E♭maj7 Gmmaj7 Cm6·D7♭9 D B♭maj7♯5 Gm6·E♭maj7 D; B: E♭maj7 D Cm9 Gmmaj7 E♭maj7 B♭maj7♯5 Cm6·D7♭9 Dsus4·D | the motif made exotic (A–D–E♭–F♯); celesta, flute, music box, mallet pulse, low frame drum; ends on the day song's G → F♯ sigh |

Still to write: the title screen theme (and the Northpass's / camp's music, if they need one). Slash chords
(`F#/C#`) are supported: tone 0 of a slash chord is its bass note (within a tritone below the root, else just above).
