/**
 * Flute songs. Notes are indices 0–4 into the flute's five notes (shown as 1–5 on a
 * keyboard). What each song *does* is content (`src/content/`), not defined here.
 */

export type SongId = 'hours' | 'waking';

export interface SongDef {
  id: SongId;
  name: string;
  notes: number[];
}

export const SONGS: SongDef[] = [
  { id: 'hours', name: 'Song of Hours', notes: [4, 2, 0, 4, 2, 0] },
  { id: 'waking', name: 'Song of Waking', notes: [1, 3, 2, 1, 4] },
];

export const SONG_IDS = SONGS.map((s) => s.id);

export function songById(id: SongId) {
  return SONGS.find((s) => s.id === id)!;
}

/** The known song whose notes the player just finished playing, if any. */
export function matchSong(played: readonly number[], known: ReadonlySet<SongId>): SongDef | null {
  for (const song of SONGS) {
    if (!known.has(song.id) || played.length < song.notes.length) continue;
    const tail = played.slice(-song.notes.length);
    if (tail.every((n, i) => n === song.notes[i])) return song;
  }
  return null;
}

/** A song's notes as dialog markup, e.g. "{1} {3} {2}" (rendered as note buttons). */
export function notesMarkup(id: SongId) {
  return songById(id).notes.map((n) => `{${n}}`).join(' ');
}
