# Audio

Everything is synthesized with Web Audio: no samples, no recordings, all melodies original
(write in the *style* of late-90s adventure scores; never quote an existing game's tune).
Sound effects are small functions in `core/audio.ts` (`Sfx`); background music is data
played by `core/synth.ts`. An agent can't hear any of it: render to WAV, measure levels,
and ask the owner to listen.

## Music (`core/music.ts`, `core/synth.ts`, `core/tracks.ts`)

Songs are written as data, like an arrangement in a DAW: **sections** (intro, A, A', B...)
end to end, each with a chord line (`F | Am | Dm Gm | C`), an optional hand-written
melody (`C5*2 F5*3 G5 A5*2 | ...`, `*n` = steps, `.` = rest; a step is an eighth note) and
**layers**: the melody on an instrument (optionally octave-shifted), or patterns that
follow the chords (`tones`: chord-tone numbers like an arpeggiator; `chord`: a held pad
voiced near a center note; `beat`: drums, `X x o .`). Every bar must add up exactly, or
`compile` throws (tests catch miscounted melodies). A song loops back to `loopFrom`
(after the intro). Instruments: flute, bell (celesta), box (detuned music box), harp, pad,
bass, drive (boss bass), brass, mallet (soft marimba-like wood), kick, snare, hat, shaker,
tom. Chord names: `C`, `Cm`, `C7`, `Cm7`, `Cmaj7`, `Csus4`, `Csus2`, `Cdim` (with `#`/`b`);
add a quality to `QUALITIES` in `music.ts` when a song needs one (no music library needed).

**Which theme plays** (`Game.updateWorld`): the boss theme while a boss is engaged;
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

## The harmonic plan (the owner's, 2026-11-02): every theme follows it

Every song in the valley revolves around one base progression, **Gmaj7 → Dmaj7** (G with a
lydian lift: the C♯ of Dmaj7 floating over G). New themes for this region must build on it:
- **Night** adds **Gmaj7 Dmaj7 F♯/C♯ Bm** (the owner wrote F♯/D♭; C♯ is the same note).
- **Boss themes** are frantic versions of their base progression, with extra chord changes.
- **Dungeons** add their own color chords around the base (the shrine: Fmaj7 and E♭maj7,
  each resolving to Dmaj7).

Music always plays, except during death: it stops dead, a falling "defeat" figure plays
(`Sfx.defeat`), the screen goes black, Wren respawns and the theme starts again from the
top (`ScriptApi.silenceMusic`, used by the `death` script). If the browser suspends audio,
`Sfx.updateMusic` resumes it.

## Themes (`core/tracks.ts`)

| Mood | Song | Key / tempo | Progression | Sound |
|---|---|---|---|---|
| `day` | Emberfield | G, 104 | Gmaj7 Dmaj7 throughout (B section: two bars each) | harp, flute, frame drum and shaker from the 2nd verse, celesta doubling |
| `village` | Thistledown | G, 92 | Gmaj7 Dmaj7 | simpler: wooden mallet tune, pad, walking bass, flute the 2nd time; plays in Thistledown by day (`Overworld.musicAt`) |
| `night` | Lanterns Out | B minor, 72 | Gmaj7 Dmaj7 F♯/C♯ Bm (bridge: two bars each) | celesta lullaby, flute an octave down, slow harp |
| `boss` | The Lamplighter's Round | B minor, 152 | A: Gmaj7 Dmaj7 F♯/C♯ Bm Gmaj7 Dmaj7 Em7 F♯; B: Bm A Gmaj7 Em7 Cmaj7 (Neapolitan) F♯/C♯ Bm F♯ | driving bass and drums, music box, synth brass |
| `shrine` | The Sleeping Stones | G, 80 | Gmaj7 Dmaj7 Fmaj7 Dmaj7 E♭maj7 Dmaj7 Gmaj7 Dmaj7 (bridge: Fmaj7 E♭maj7 Gmaj7 Dmaj7, two bars each) | celesta, flute, mallet pulse, low frame drum |

Still to write: **Gravelheart's** theme (a boss version of the shrine progression, more
harmonic complexity; goes with milestone 6) and the title screen theme. Slash chords
(`F#/C#`) are supported: tone 0 of a slash chord is its bass note.
