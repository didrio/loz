import { describe, expect, it } from 'vitest';
import { matchSong, notesMarkup, SONGS, type SongId } from './songs';

const all = new Set<SongId>(SONGS.map((s) => s.id));

describe('songs', () => {
  it('matches a song at the end of what was played', () => {
    expect(matchSong([0, 1, 3, 2, 1, 4], all)?.id).toBe('waking');
    expect(matchSong([4, 2, 0, 4, 2, 0], all)?.id).toBe('hours');
  });

  it('ignores songs the player does not know yet', () => {
    expect(matchSong([1, 3, 2, 1, 4], new Set<SongId>(['hours']))).toBeNull();
  });

  it('needs the whole song', () => {
    expect(matchSong([3, 2, 1, 4], all)).toBeNull();
  });

  it('keeps every song distinct, and none the ending of another', () => {
    for (const a of SONGS) {
      for (const b of SONGS) {
        if (a === b) continue;
        expect(matchSong(a.notes, new Set([b.id]))).toBeNull();
      }
      expect(a.notes.every((n) => n >= 0 && n <= 4)).toBe(true);
    }
  });

  it('renders notes as dialog markup', () => {
    expect(notesMarkup('waking')).toBe('{1} {3} {2} {1} {4}');
  });
});
